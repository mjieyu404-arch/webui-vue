import api from '@/store/api';
import Cookies from 'js-cookie';
import router from '@/router';
import { roles } from '@/router/routes';

const shouldPersistAuthToken =
  import.meta.env.VITE_STORE_SESSION === 'true' ||
  import.meta.env.STORE_SESSION === 'true';

const AuthenticationStore = {
  namespaced: true,
  state: {
    consoleWindow: null,
    authError: false,
    ntubAuthenticated: false,
    xsrfCookie: Cookies.get('XSRF-TOKEN'),
    isAuthenticatedCookie: Cookies.get('IsAuthenticated'),
    sessionURI: localStorage.getItem('sessionURI'),
    xAuthToken: shouldPersistAuthToken
      ? Cookies.get('X-Auth-Token') || null
      : null,
  },
  getters: {
    consoleWindow: (state) => state.consoleWindow,
    authError: (state) => state.authError,
    isLoggedIn: (state) => {
      if (state.ntubAuthenticated) return true;
      // We might have gotten XSRF-TOKEN (and HttpOnly SESSION cookie) by Mutual TLS authentication,
      // without going through explicit Session creation
      return (
        state.xsrfCookie !== undefined ||
        state.isAuthenticatedCookie == 'true' ||
        !!state.xAuthToken
      );
    },
    // Used to authenticate WebSocket connections via subprotocol value
    token: (state) => state.xsrfCookie,
  },
  mutations: {
    ntubLoginSuccess(state) {
      state.ntubAuthenticated = true;
      state.authError = false;
    },
    authSuccess(state, { session, token }) {
      state.authError = false;
      state.xsrfCookie = Cookies.get('XSRF-TOKEN');
      state.isAuthenticatedCookie = Cookies.get('IsAuthenticated');
      // Preserve session data across page reloads and browser restarts
      localStorage.setItem('sessionURI', session);
      state.sessionURI = session;
      // If we didn't get the XSRF cookie it means we are talking to a
      // Redfish implementation that is not bmcweb. In this case get the token
      // from headers and send it with the future requests, do not permanently
      // save anywhere.
      if (state.xsrfCookie === undefined) {
        api.set_auth_token(token);
        state.xAuthToken = token;
      }
    },
    authError(state, authError = true) {
      state.authError = authError;
    },
    logout(state) {
      state.ntubAuthenticated = false;
      Cookies.remove('X-Auth-Token');
      Cookies.remove('XSRF-TOKEN');
      Cookies.remove('IsAuthenticated');
      api.set_auth_token(undefined);
      localStorage.removeItem('storedUsername');
      state.xsrfCookie = undefined;
      state.isAuthenticatedCookie = undefined;
      localStorage.removeItem('sessionURI');
      state.sessionURI = null;
      state.xAuthToken = null;
      state.consoleWindow = false;
    },
  },
  actions: {
    login({ commit }, { username, password }) {
      commit('authError', false);

      return fetch('/ntub-api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Login failed: HTTP ' + response.status);
          }

          const user = await response.json();

          commit('ntubLoginSuccess');
          commit('global/setSessionRole', user.role, { root: true });

          return false;
        })
        .catch((error) => {
          commit('authError', true);
          throw error;
        });
    },

    logout({ commit }) {
      return fetch('/ntub-api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
        .then((response) => {
          if (!response.ok && response.status !== 401) {
            throw new Error('Logout failed: HTTP ' + response.status);
          }

          commit('logout');

          try {
            commit('virtualMedia/clearDevices', null, { root: true });
          } catch (error) {
            console.warn('Clear virtual media:', error);
          }

          return router.replace('/login');
        })
        .catch((error) => {
          console.error('NTUB logout error:', error);
          throw error;
        });
    },
    getSessionPrivilege({ commit, state }) {
      return api
        .get(state.sessionURI)
        .then(({ data }) => setSessionPrivilege(commit, data));
    },
    resetStoreState({ state }) {
      state.authError = false;
      state.xsrfCookie = Cookies.get('XSRF-TOKEN');
      state.isAuthenticatedCookie = Cookies.get('IsAuthenticated');
      // Only update xAuthToken if we're persisting to cookies.
      // If using in-memory tokens, don't wipe out what was set during login.
      if (shouldPersistAuthToken) {
        state.xAuthToken = Cookies.get('X-Auth-Token') || null;
      }
    },
  },
};

const setSessionPrivilege = (commit, data) => {
  // Roles come from the Session resource. LDAP and certificate sessions
  // may have Roles without a corresponding AccountService user.
  // If the backend didn't provide role information, or provides an empty
  // Roles array, we default to Administrator to avoid hiding potentially
  // useful UI elements. All security enforcement happens on the backend.
  const sessionRoles = data.Roles ?? [];
  commit('global/setSessionRole', sessionRoles[0] ?? roles.administrator, {
    root: true,
  });
};

export default AuthenticationStore;

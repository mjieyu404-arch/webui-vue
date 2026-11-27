const exact = {
  'Invalid temperature value': 'invalidTemperature',
  'Invalid voltage value': 'invalidVoltage',
  'Invalid current value': 'invalidCurrent',
  'Invalid fan RPM': 'invalidFan',
  'Invalid history response': 'invalidHistory',
  '歷史 API 未回傳有效的 JSON 資料。': 'invalidJson',
  '歷史資料格式不符：缺少 points 陣列。': 'missingPoints',
  '歷史資料的時間或溫度格式不符，無法繪製圖表。': 'invalidPoints',
  '歷史資料讀取逾時，稍後會自動重試。': 'timeout',
  '無法連線到歷史 API，請確認 SSH 通道與後端服務仍在執行。': 'connection',
  '歷史資料更新失敗，稍後會自動重試。': 'updateFailed',
  '歷史 API 要求登入（401），請重新登入 WebUI 後再試。': 'unauthorized',
  '目前沒有讀取歷史資料的權限（403）。': 'forbidden',
};

export function formatNtubError(error, t) {
  if (!error) return '';

  const text = String(error);
  const match =
    text.match(/^HTTP\s+(\d{3})$/) ||
    text.match(/^無法取得歷史資料（HTTP\s+(\d{3})）。$/);

  if (match) {
    const status = Number(match[1]);

    if (status === 401) return t('ntubErrors.unauthorized');

    if (status === 403) return t('ntubErrors.forbidden');

    return t('ntubErrors.httpStatus', { status });
  }

  if (Object.prototype.hasOwnProperty.call(exact, text)) {
    return t('ntubErrors.' + exact[text]);
  }

  if (
    /Failed to fetch|fetch failed|NetworkError|Load failed|網路/i.test(text)
  ) {
    return t('ntubErrors.connection');
  }

  return t('ntubErrors.unexpected');
}

const getConfigs = (() => {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    'PRIVATE_KEY': scriptProperties.getProperty('PRIVATE_KEY').replace(/\\n/g, "\n"),
    'CLIENT_EMAIL': scriptProperties.getProperty('CLIENT_EMAIL'),
    'CLIENT_ID': scriptProperties.getProperty('CLIENT_ID'),
    'USER_EMAIL': scriptProperties.getProperty('USER_EMAIL'),
    'SERVICE_NAME': 'storage-client:' + scriptProperties.getProperty('USER_EMAIL'),
    'SERVICE_SCOPES': ['https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/devstorage.read_write',
      'https://www.googleapis.com/auth/devstorage.full_control'
    ],
    'PROJECT_ID': scriptProperties.getProperty('PROJECT_ID'),
    'API_KEY': scriptProperties.getProperty('API_KEY')
  };
})();


const lib = (() => {
  /*************************************************************
    INITIALIZATION
  *************************************************************/

  const CREDENTIALS = getConfigs;
  const BASE_URL = 'https://storage.googleapis.com/storage/v1';

  // attempt service OAuth authorization
  const _service = (() => {
    return OAuth2.createService(CREDENTIALS.SERVICE_NAME)
      // set the endpoint URL
      .setTokenUrl('https://oauth2.googleapis.com/token')
      // set the credentials
      .setPrivateKey(CREDENTIALS.PRIVATE_KEY)
      .setClientId(CREDENTIALS.CLIENT_ID)
      .setIssuer(CREDENTIALS.CLIENT_EMAIL)
      // set the property store where authorized tokens should be persisted
      .setPropertyStore(PropertiesService.getScriptProperties())
      .setScope(CREDENTIALS.SERVICE_SCOPES);
  })();

  const _reset = (service) => {
    service.reset();
  };

  // return Error message associated with invalid authorization of service
  if(!_service.hasAccess()) {
    const error = _service.getLastError();
    Logger.log(CREDENTIALS.SERVICE_NAME + ':' + error);
    _reset(_service);
    return error;
  }

  // general API request
  const _request = (url, method, options = {}) => {
    try {
      const reqOptions = {
        method,
        headers: {
          Authorization: 'Bearer ' + _service.getAccessToken(),
        }
      }

      if('headers' in options) reqOptions.headers = {...reqOptions.headers, ...options.headers};
      if('payload' in options) reqOptions.payload = options.payload;

      const response = UrlFetchApp.fetch(url, reqOptions);

      if(response.getResponseCode() === 200) {
        const json = response.getContentText();

        if(json !== undefined && json.length) {
          const data = JSON.parse(json);

          if(data !== null) return data;
        }
      } else {
        Logger.log(url + ' Status: ' + response.getResponseCode());
        return response;
      }
    } catch(err) {
      Logger.log('Cloud Storage Error: ', err);
    }
  };

  const _headers = (mimeType) => {
    const headers = {};

    switch(mimeType) {
      case 'javascript':
      case 'json':
      case 'octet-stream':
      case 'ogg':
      case 'pdf':
      case 'x-www-form-urlencoded':
      case 'xml':
      case 'x-gzip':
      case 'zip':
        headers['Content-Type'] = 'application/' + mimeType;
        break;
      case 'gif':
      case 'jpeg':
      case 'png':
      case 'svg+xml':
      case 'tiff':
      case 'x-icon':
        headers['Content-Type'] = 'image/' + mimeType;
        break;
      case 'css':
      case 'csv':
      case 'html':
      case 'plain':
      case 'xml':
        headers['Content-Type'] = 'text/' + mimeType;
        break;
      default:
        headers['Content-Type'] = 'text/plain';
    }

    return headers
  };

  /*************************************************************
    BUCKET API ACTIONS
  *************************************************************/

  const createBucket = (name, payload = {}, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/buckets/insert
    params = { ...params, project: CREDENTIALS.PROJECT_ID, alt: 'json' }
    const URI = BASE_URL + '/b' + Utils.buildQueryParams(params);
    const headers = _headers('json');
    const options = {
      headers,
      payload: {
        name: name + '_' + CREDENTIALS.PROJECT_ID,
        location: 'US-WEST1',
        storageClass: 'STANDARD'
      }
    };

    if(Object.keys(payload).length > 0) options.payload = {...options.payload, ...payload};
    options.payload = JSON.stringify(options.payload);

    return _request(URI, 'POST', options);
  };

  const getBucket = (name, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/buckets/get
    const URI = BASE_URL + '/b/' + name + Utils.buildQueryParams(params);
    return _request(URI, 'GET');
  };

  const listBuckets = (params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/buckets/list
    params = { ...params, project: CREDENTIALS.PROJECT_ID };
    const URI = BASE_URL + '/b' + Utils.buildQueryParams(params);
    return _request(URI, 'GET');
  };

  // TODO: separate PATCH from PUT update
  const updateBucket = (name, payload = {}, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/buckets/patch
    const URI = BASE_URL + '/b/' + encodeURIComponent(name) + Utils.buildQueryParams(params);
    const headers = _headers('json');
    const options = { headers };

    if(Object.keys(payload).length) options.payload = JSON.stringify(payload);

    return _request(URI, 'PATCH', options);
  };

  const deleteBucket = (name) => {
    const URI = BASE_URL + '/b/' + encodeURIComponent(name);
    return _request(URI, 'DELETE');
  };

  /*************************************************************
    OBJECT API ACTIONS
  *************************************************************/

  const createObject = (blob, bucket, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/objects/insert
    params = { ...params, name: blob.getName(), uploadType: 'multipart' };
    const data = blob.getDataAsString();
    const URI = 'https://storage.googleapis.com/upload/storage/v1/b/' + encodeURIComponent(bucket) + '/o' + Utils.buildQueryParams(params);
    const headers = _headers(blob.getContentType().split('/')[1]);
    const options = {
      headers,
      payload: data
    };

    return _request(URI, 'POST', options);
  };

  const getObject = (name, bucket, params = {}, getMedia = false) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/objects/get
    params = { ...params, alt: (getMedia ? 'media' : 'json') }
    const URI = BASE_URL + '/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(name) + Utils.buildQueryParams(params);
    return _request(URI, 'GET');
  };

  const listObjects = (bucket, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/objects/list
    const URI = BASE_URL + '/b/' + encodeURIComponent(bucket) + '/o' + Utils.buildQueryParams(params);
    return _request(URI, 'GET');
  };

  // TODO: separate PATCH from PUT update
  const updateObject = (name, bucket, payload = {}, params = {}) => {
    // for list of params: https://cloud.google.com/storage/docs/json_api/v1/objects/patch
    const URI = BASE_URL + '/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(name) + Utils.buildQueryParams(params);
    const headers = _headers('json');
    const options = { headers };

    if(Object.keys(payload).length) options.payload = JSON.stringify(payload);

    return _request(URI, 'PATCH', options);
  };

  const deleteObject = (name, bucket) => {
    const URI = BASE_URL + '/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(name);
    return _request(URI, 'DELETE');
  };

  return {
    createBucket,
    getBucket,
    listBuckets,
    updateBucket,
    deleteBucket,
    createObject,
    getObject,
    listObjects,
    updateObject,
    deleteObject
  };
})();

const init = () => {
  return lib;
};
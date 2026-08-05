import COS from 'cos-nodejs-sdk-v5';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

const DATASET_DEFINITIONS = {
  image: {
    env: 'METAINSIGHT_IMAGE_DATASET',
    fallback: '717-image-search',
    template: 'ImageSearch',
    label: '图片语义',
  },
  video: {
    env: 'METAINSIGHT_VIDEO_DATASET',
    fallback: '717-video-search',
    template: 'VideoSearch',
    label: '视频语义',
  },
  document: {
    env: 'METAINSIGHT_DOC_DATASET',
    fallback: '717-doc-search',
    template: 'DocSearch',
    label: '文档内容',
  },
};

let cosClient;

const requireEnvironment = () => {
  const required = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`缺少环境变量：${missing.join(', ')}`);
};

const getCosClient = () => {
  requireEnvironment();
  if (!cosClient) {
    cosClient = new COS({
      SecretId: process.env.COS_SECRET_ID,
      SecretKey: process.env.COS_SECRET_KEY,
    });
  }
  return cosClient;
};

const getDatasets = () => Object.fromEntries(
  Object.entries(DATASET_DEFINITIONS).map(([type, definition]) => [
    type,
    {
      name: process.env[definition.env] || definition.fallback,
      template: definition.template,
      label: definition.label,
    },
  ]),
);

const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

const findNestedValue = (value, key) => {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const match = findNestedValue(child, key);
    if (match !== undefined) return match;
  }
  return undefined;
};

const toText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(',');
  return String(value['#text'] || value.Url || value.URL || '');
};

const parseSearchResults = (xml) => {
  const parsed = xmlParser.parse(String(xml || ''));
  const results = [];
  for (const [section, type] of [['Doc', 'document'], ['Image', 'image'], ['Video', 'video']]) {
    const group = findNestedValue(parsed, `${section}Result`);
    // MetaInsight currently returns <ImageResult><URI>...</URI></ImageResult>
    // directly. Some result types use an additional <Image> / <Doc> wrapper.
    const items = asArray(group).flatMap((entry) => {
      const nested = entry && typeof entry === 'object' ? entry[section] : undefined;
      return nested == null ? [entry] : asArray(nested);
    });
    for (const item of items) {
      const uri = toText(item?.URI);
      if (!uri) continue;
      results.push({
        type,
        uri,
        assetUrl: toSignedAssetUrl(uri),
        previewUrl: toSignedAssetUrl(toText(item.ImageUrls) || uri),
        score: Number(toText(item.Score)) || 0,
        text: toText(item.Text),
        page: toText(item.TextPage),
        imageUrls: toText(item.ImageUrls),
      });
    }
  }
  return results;
};

const requestCos = (client, options) => new Promise((resolve, reject) => {
  client.request(options, (error, data) => error ? reject(error) : resolve(data));
});

const getCiHost = () => {
  const appId = String(process.env.COS_BUCKET).split('-').pop();
  return `${appId}.ci.${process.env.COS_REGION}.myqcloud.com`;
};

const toSignedAssetUrl = (uri) => {
  const value = String(uri || '');
  if (!value.startsWith('cos://')) return value;
  const reference = value.slice('cos://'.length);
  const separator = reference.indexOf('/');
  if (separator <= 0) return value;
  const bucket = reference.slice(0, separator);
  const key = reference.slice(separator + 1);
  if (!key || bucket !== process.env.COS_BUCKET) return value;
  return getCosClient().getObjectUrl({
    Bucket: bucket,
    Region: process.env.COS_REGION,
    Key: key,
    Sign: true,
    Expires: 3600,
    Protocol: 'https:',
  });
};

export const searchMetaInsightAssets = async ({ query, assetType = 'all', limit = 10, threshold = 1 }) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('query 不能为空');
  const datasets = getDatasets();
  const selectedTypes = assetType === 'all' ? Object.keys(datasets) : [assetType];
  if (selectedTypes.some((type) => !datasets[type])) throw new Error(`不支持的素材类型：${assetType}`);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safeThreshold = Math.max(Number(threshold) || 0, 0);
  const client = getCosClient();
  const ciHost = getCiHost();

  const batches = await Promise.all(selectedTypes.map(async (type) => {
    const dataset = datasets[type];
    const body = JSON.stringify({
      DatasetName: dataset.name,
      Mode: 'text',
      Templates: dataset.template,
      SearchText: cleanQuery,
      Limit: safeLimit,
      MatchThreshold: safeThreshold,
    });
    const data = await requestCos(client, {
      Method: 'POST',
      Url: `https://${ciHost}/datasetquery/hybridsearch`,
      Headers: { 'Content-Type': 'application/json' },
      Body: body,
      RawBody: true,
    });
    return parseSearchResults(data.Body?.toString() || '').map((result) => ({
      ...result,
      type,
      dataset: dataset.name,
    }));
  }));

  const results = batches.flat().sort((left, right) => right.score - left.score).slice(0, safeLimit);
  return {
    query: cleanQuery,
    assetType,
    count: results.length,
    datasets: selectedTypes.map((type) => ({ type, ...datasets[type] })),
    results,
  };
};

export const getMetaInsightDatasetStatus = async () => {
  const client = getCosClient();
  const ciHost = getCiHost();
  const datasets = getDatasets();
  const statuses = await Promise.all(Object.entries(datasets).map(async ([type, dataset]) => {
    try {
      const data = await requestCos(client, {
        Method: 'GET',
        Url: `https://${ciHost}/dataset`,
        Query: { datasetname: dataset.name },
      });
      const remote = data.Response?.Dataset || {};
      return {
        type,
        ...dataset,
        state: remote.State || 'Unknown',
        progress: Number(remote.TaskProgress || 0),
      };
    } catch (error) {
      return {
        type,
        ...dataset,
        state: 'Error',
        progress: 0,
        error: error.error?.Message || error.message || '数据集状态查询失败',
      };
    }
  }));
  return { datasets: statuses };
};

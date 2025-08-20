import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;
const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

interface ImageKeysResult {
  imageKeys: string[];
  nextCursor: string | null;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const tags = event.multiValueQueryStringParameters?.tag;
    const nextPageToken = event.queryStringParameters?.nextPageToken;

    const pageSize = getPageSize(event.queryStringParameters?.pageSize);

    if (tags) {
      return getImagesByTags(tags, pageSize, nextPageToken);
    } else {
      return listAllImages(pageSize, nextPageToken);
    }
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

function getPageSize(pageSizeQueryParam: string | undefined) {
  if (!pageSizeQueryParam) {
    return DEFAULT_PAGE_SIZE;
  }
  const requestedSize = parseInt(pageSizeQueryParam, 10);
  if (!isNaN(requestedSize) && requestedSize > 0) {
    return Math.min(requestedSize, MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
}

async function getImageKeys(
  tags: string[],
  startKey: string | undefined,
  pageSize: number,
): Promise<ImageKeysResult> {
  const limitPerTag = tags.length > 1 ? 2 * pageSize : pageSize;
  // 1. Query each tag for its list of images, starting from the cursor.
  const queryPromises = tags.map((tag) => {
    const queryCommand = new QueryCommand({
      TableName: TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
      Limit: limitPerTag,
      ExclusiveStartKey: startKey ? { Tag: tag, ImageKey: startKey } : undefined,
    });
    return ddbDocClient.send(queryCommand);
  });

  const queryResults = await Promise.all(queryPromises);

  // 2. Determine the cursor for the *next* page.
  let nextCursor: string | null = null;

  for (const result of queryResults) {
    const thisTagsCursor = result.LastEvaluatedKey?.ImageKey;
    if (thisTagsCursor) {
      if (!nextCursor || thisTagsCursor < nextCursor) {
        nextCursor = thisTagsCursor;
      }
    }
    if (!result.Items || result.Items?.length == 0) {
      nextCursor = null;
      break;
    }
  }

  // 3. Calculate the intersection of image keys for the current page.
  const imageKeySets = queryResults.map(
    (result) => new Set(result.Items ? result.Items.map((item) => item.ImageKey) : []),
  );

  const intersection =
    imageKeySets.length > 0
      ? imageKeySets.reduce(
          (acc, currentSet) =>
            new Set([...acc].filter((imageKey) => currentSet.has(imageKey))),
        )
      : new Set();

  return {
    imageKeys: [...intersection].sort(),
    nextCursor,
  };
}

const getImagesByTags = async (
  tags: string[],
  pageSize: number,
  nextPageToken?: string,
): Promise<APIGatewayProxyResult> => {
  let nextCursor = decodeNextPageToken(nextPageToken);
  const allImageKeys: string[] = [];

  while (allImageKeys.length < pageSize) {
    const result = await getImageKeys(tags, nextCursor, pageSize);
    allImageKeys.push(...result.imageKeys);
    nextCursor = result.nextCursor ?? undefined;

    if (!nextCursor) {
      // No more items to fetch from the source
      break;
    }
  }

  let finalImageKeys = allImageKeys;
  if (allImageKeys.length > pageSize) {
    finalImageKeys = allImageKeys.slice(0, pageSize);
    // The next token should point to the last item we have seen because it is used as an exclusive startKey.
    nextCursor = allImageKeys[pageSize - 1];
  }

  const finalNextPageToken = encodeNextPageToken(nextCursor);

  if (finalImageKeys.length === 0) {
    return ApiResponse.success({ images: [], nextPageToken: finalNextPageToken });
  }

  const batchGetCommand = new BatchGetCommand({
    RequestItems: {
      [IMAGE_TAGS_TABLE_NAME as string]: {
        Keys: finalImageKeys.map((key) => ({ ImageKey: key })),
        ProjectionExpression: 'ImageKey, ThumbnailUrl',
      },
    },
  });

  const { Responses } = await ddbDocClient.send(batchGetCommand);
  const images = Responses ? Responses[IMAGE_TAGS_TABLE_NAME as string] : [];

  // Sort the final results by ImageKey to ensure a consistent order.
  images.sort((a, b) => a.ImageKey.localeCompare(b.ImageKey));

  return ApiResponse.success({ images, nextPageToken: finalNextPageToken });
};

const listAllImages = async (
  pageSize: number,
  nextPageToken?: string,
): Promise<APIGatewayProxyResult> => {
  const startKey = decodeNextPageToken(nextPageToken);

  const queryCommand = new QueryCommand({
    TableName: IMAGE_TAGS_TABLE_NAME,
    IndexName: 'AllImagesIndex', // Target the GSI
    KeyConditionExpression: 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': 'ALL_IMAGES',
    },
    ProjectionExpression: 'ImageKey, ThumbnailUrl',
    Limit: pageSize,
    ExclusiveStartKey: startKey
      ? { GSI1PK: 'ALL_IMAGES', ImageKey: startKey }
      : undefined,
  });

  const { Items, LastEvaluatedKey } = await ddbDocClient.send(queryCommand);

  const finalNextPageToken = encodeNextPageToken(LastEvaluatedKey?.ImageKey);

  return ApiResponse.success({
    images: Items || [],
    nextPageToken: finalNextPageToken,
  });
};

export function encodeNextPageToken(imageKeyCursor?: string): string | undefined {
  if (!imageKeyCursor) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(imageKeyCursor)).toString('base64');
}

export function decodeNextPageToken(nextPageToken?: string): string | undefined {
  if (!nextPageToken) {
    return undefined;
  }
  return JSON.parse(Buffer.from(nextPageToken, 'base64').toString('utf-8'));
}

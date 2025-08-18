import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;
const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const tags = event.multiValueQueryStringParameters?.tag;

        if (tags) {
            return getImagesByTags(tags);
        } else {
            return listAllImages();
        }
    } catch (error) {
        return ApiResponse.serverError(error);
    }
};

const getImagesByTags = async (tags: string[]): Promise<APIGatewayProxyResult> => {
    // This logic remains the same, as it queries the inverted index table
    const queryPromises = tags.map(tag => {
        const queryCommand = new QueryCommand({
            TableName: TAG_IMAGES_TABLE_NAME,
            KeyConditionExpression: "Tag = :t",
            ExpressionAttributeValues: { ":t": tag },
        });
        return ddbDocClient.send(queryCommand);
    });

    const queryResults = await Promise.all(queryPromises);

    const imageKeySets = queryResults.map(result => 
        new Set(result.Items ? result.Items.map(item => item.ImageKey) : [])
    );

    const intersection = imageKeySets.reduce((acc, currentSet) => {
        return new Set([...acc].filter(imageKey => currentSet.has(imageKey)));
    });

    return ApiResponse.success({
        tags: tags,
        imageKeys: [...intersection],
    });
};

const listAllImages = async (): Promise<APIGatewayProxyResult> => {
    // New logic: Scan the ImageTagsTable to get all image data
    const scanCommand = new ScanCommand({
        TableName: IMAGE_TAGS_TABLE_NAME,
        ProjectionExpression: "ImageKey, ThumbnailUrl",
    });

    const { Items } = await ddbDocClient.send(scanCommand);

    return ApiResponse.success({
        images: Items || [],
    });
};

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

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
    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
    });

    const { Contents } = await s3Client.send(command);
    const imageKeys = Contents ? Contents.map(c => c.Key) : [];

    return ApiResponse.success({
        images: imageKeys,
        message: `Successfully retrieved ${imageKeys.length} images.`,
    });
};

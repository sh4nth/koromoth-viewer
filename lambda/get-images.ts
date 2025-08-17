import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const baseDynamoDBClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(baseDynamoDBClient);
const s3Client = new S3Client({});

const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));

        const tags = event.multiValueQueryStringParameters?.tag;

        if (tags) {
            return getImagesByTags(tags);
        } else {
            return listAllImages();
        }
    } catch (error) {
        console.error("Error in images handler:", error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Failed to process request.', error: errorMessage }),
        };
    }
};

const getImagesByTags = async (tags: string[]): Promise<APIGatewayProxyResult> => {
    const queryPromises = tags.map(tag => {
        const queryCommand = new QueryCommand({
            TableName: TAG_IMAGES_TABLE_NAME,
            KeyConditionExpression: "Tag = :t",
            ExpressionAttributeValues: {
                ":t": tag,
            },
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

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            tags: tags,
            imageKeys: [...intersection],
        }),
    };
};

const listAllImages = async (): Promise<APIGatewayProxyResult> => {
    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
    });

    const { Contents } = await s3Client.send(command);
    const imageKeys = Contents ? Contents.map(c => c.Key) : [];

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            images: imageKeys,
            message: `Successfully retrieved ${imageKeys.length} images.`,
        }),
    };
};

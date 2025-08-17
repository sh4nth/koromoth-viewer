
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Received event for listing images:", JSON.stringify(event, null, 2));

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
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET'
            },
            body: JSON.stringify({
                images: imageKeys,
                message: `Successfully retrieved ${imageKeys.length} images.`,
            }),
        };
    } catch (error) {
        console.error("Error listing images:", error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET'
            },
            body: JSON.stringify({ message: 'Failed to list images.', error: errorMessage }),
        };
    }
};

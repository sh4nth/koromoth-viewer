import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
// BUCKET_NAME will be passed as an environment variable from the CDK stack
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event) => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));

        const imageKey = event.queryStringParameters?.key;

        if (!imageKey) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET'
                },
                body: JSON.stringify({ message: 'Missing image key in query parameters. Use ?key=filename.jpg' }),
            };
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: imageKey,
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 }); // Expires in 1 minute

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET'
            },
            body: JSON.stringify({
                imageUrl: presignedUrl,
                message: `Successfully generated presigned URL for ${imageKey}`,
            }),
        };
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET'
            },
            body: JSON.stringify({ message: 'Failed to generate image URL.', error: error.message }),
        };
    }
};

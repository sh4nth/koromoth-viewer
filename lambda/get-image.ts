import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const claims = event.requestContext.authorizer?.claims;
    const userId = claims?.sub;
    const userEmail = claims?.email;

    if (userId) {
      console.log(`Request from authenticated user: ${userEmail} (${userId})`);
    } else {
      console.log('Request from a guest user.');
    }

    const imageKey = event.pathParameters?.key;

    if (!imageKey) {
      return ApiResponse.badRequest(
        'Missing image key in path. Use /image/filename.jpg',
      );
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return ApiResponse.success({
      imageUrl: presignedUrl,
      message: `Successfully generated presigned URL for ${imageKey}`,
    });
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

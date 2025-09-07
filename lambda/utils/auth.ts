import { createRemoteJWKSet, jwtVerify } from "jose";
import { APIGatewayProxyEvent } from "aws-lambda";

// This would be output by your CDK stack
const userPoolId = process.env.USER_POOL_ID;
const region = process.env.AWS_REGION;
const iss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const JWKS = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`));

interface UserClaims {
  sub: string;
  email: string;
  [key: string]: any;
}

export async function getUserClaims(
  event: APIGatewayProxyEvent,
): Promise<UserClaims | null> {
  const token = event.headers.Authorization;

  if (!token) {
    return null; // No token, user is a guest
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: iss,
    });
    return payload as UserClaims;
  } catch (error) {
    console.error("Token validation failed:", error);
    return null; // Token is invalid or expired
  }
}

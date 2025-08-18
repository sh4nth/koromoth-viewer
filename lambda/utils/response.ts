import { APIGatewayProxyResult } from 'aws-lambda';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export class ApiResponse {
  static success<T>(body: T): APIGatewayProxyResult {
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify(body),
    };
  }

  static badRequest(message: string): APIGatewayProxyResult {
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({ message }),
    };
  }

  static serverError(error: unknown): APIGatewayProxyResult {
    console.error('Server Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';

    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        message: 'An internal server error occurred.',
        error: errorMessage,
      }),
    };
  }
}

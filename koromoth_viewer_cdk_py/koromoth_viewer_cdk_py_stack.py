import os
from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    CfnOutput,
    CfnParameter, # <-- New Import
    Duration,
)
from constructs import Construct

class KoromothViewerCdkPyStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. Define a CfnParameter for the existing S3 Bucket Name
        # This allows you to pass the bucket name during deployment
        existing_bucket_name_param = CfnParameter(self, "ExistingBucketName",
            type="String",
            description="The name of the existing S3 bucket where images are stored.",
        )

        # 2. Reference the existing S3 Bucket
        # We use from_bucket_name to reference a bucket that already exists
        images_bucket = s3.Bucket.from_bucket_name(
            self,
            "ExistingImagesBucket",
            bucket_name=existing_bucket_name_param.value_as_string # Use the parameter value
        )

        # Define the ImageTagsTable
        image_tags_table = dynamodb.Table(self, "ImageTagsTable",
            partition_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        # Define the TagImagesTable (Inverted Index)
        tag_images_table = dynamodb.Table(self, "TagImagesTable",
            partition_key=dynamodb.Attribute(name="Tag", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        # 3. Create Lambda Function
        lambda_code_path = os.path.join(os.path.dirname(__file__), "..", "lambda")

        serve_image_lambda = lambda_.Function(self, "ServeImageLambda",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="get-image.handler",
            code=lambda_.Code.from_asset(lambda_code_path),
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string, # Pass the parameter value to Lambda env
            },
            memory_size=128,
            timeout=Duration.seconds(30),
        )

        # Grant Lambda read permissions to the existing S3 bucket
        # CDK automatically creates an IAM policy that allows read access to this specific bucket.
        images_bucket.grant_read(serve_image_lambda)

        # 3b. Create Lambda Function to List Images
        list_images_lambda = lambda_.Function(self, "ListImagesLambda",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="list-images.handler",
            code=lambda_.Code.from_asset(lambda_code_path),
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
            },
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        images_bucket.grant_read(list_images_lambda)

        # Create Lambda Function to Add Tags
        add_tags_lambda = lambda_.Function(self, "AddTagsLambda",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="add-tags.handler",
            code=lambda_.Code.from_asset(lambda_code_path),
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        image_tags_table.grant_write_data(add_tags_lambda)
        tag_images_table.grant_write_data(add_tags_lambda)

        # Create Lambda Function to Get Tags
        get_tags_lambda = lambda_.Function(self, "GetTagsLambda",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="get-tags.handler",
            code=lambda_.Code.from_asset(lambda_code_path),
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
            },
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        image_tags_table.grant_read_data(get_tags_lambda)

        # Create Lambda Function to Get Images by Tag
        get_images_by_tag_lambda = lambda_.Function(self, "GetImagesByTagLambda",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="get-images-by-tag.handler",
            code=lambda_.Code.from_asset(lambda_code_path),
            environment={
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        tag_images_table.grant_read_data(get_images_by_tag_lambda)

        # 4. Create API Gateway
        api = apigw.RestApi(self, "KoromothViewerApi",
            rest_api_name="Koromoth Viewer Backend API",
            description="Serves presigned URLs for images from S3",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type"],
            ),
        )

        image_resource = api.root.add_resource("image")
        image_key_resource = image_resource.add_resource("{key}")
        image_key_resource.add_method("GET", apigw.LambdaIntegration(serve_image_lambda))

        tags_resource = image_key_resource.add_resource("tags")
        tags_resource.add_method("POST", apigw.LambdaIntegration(add_tags_lambda))
        tags_resource.add_method("GET", apigw.LambdaIntegration(get_tags_lambda))

        images_resource = api.root.add_resource("images")
        images_resource.add_method("GET", apigw.LambdaIntegration(list_images_lambda))

        # New endpoint for getting images by tag
        tags_root_resource = api.root.add_resource("tags")
        tag_resource = tags_root_resource.add_resource("{tag}")
        tag_images_resource = tag_resource.add_resource("images")
        tag_images_resource.add_method("GET", apigw.LambdaIntegration(get_images_by_tag_lambda))

        # Output the API Gateway URL for easy access
        CfnOutput(self, "GetImageEndpoint",
            value=f"{api.url}image/<YOUR_IMAGE_FILENAME.EXT>",
            description="The API Gateway endpoint URL to get presigned image URLs. Replace <YOUR_IMAGE_FILENAME.EXT> with your S3 image key.",
        )
        CfnOutput(self, "ListImagesEndpoint",
            value=f"{api.url}images",
            description="The API Gateway endpoint URL to list all available images.",
        )

        # Output the bucket name that was used
        CfnOutput(self, "UsedS3BucketName",
            value=existing_bucket_name_param.value_as_string,
            description="The name of the S3 bucket used for image storage.",
        )

        # Output the DynamoDB table names
        CfnOutput(self, "ImageTagsTableName",
            value=image_tags_table.table_name,
            description="The name of the DynamoDB table that stores image tags.",
        )
        CfnOutput(self, "TagImagesTableName",
            value=tag_images_table.table_name,
            description="The name of the DynamoDB table that serves as the inverted index for tags.",
        )

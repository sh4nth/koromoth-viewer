import os
from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_lambda_nodejs as nodejs,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    CfnOutput,
    CfnParameter,
    Duration,
)
from constructs import Construct

class KoromothViewerCdkPyStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        existing_bucket_name_param = CfnParameter(self, "ExistingBucketName",
            type="String",
            description="The name of the existing S3 bucket where images are stored.",
        )

        images_bucket = s3.Bucket.from_bucket_name(
            self,
            "ExistingImagesBucket",
            bucket_name=existing_bucket_name_param.value_as_string
        )

        image_tags_table = dynamodb.Table(self, "ImageTagsTable",
            partition_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        tag_images_table = dynamodb.Table(self, "TagImagesTable",
            partition_key=dynamodb.Attribute(name="Tag", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        common_nodejs_props = {
            "handler": "handler",
            "runtime": lambda_.Runtime.NODEJS_20_X,
            "deps_lock_file_path": "../lambda/package-lock.json",
            "bundling": nodejs.BundlingOptions(
                force_docker_bundling=False
            ),
            "memory_size": 128,
            "timeout": Duration.seconds(30),
        }

        serve_image_lambda = nodejs.NodejsFunction(self, "ServeImageLambda",
            entry="../lambda/get-image.ts",
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
            },
            **common_nodejs_props
        )
        images_bucket.grant_read(serve_image_lambda)

        list_images_lambda = nodejs.NodejsFunction(self, "ListImagesLambda",
            entry="../lambda/list-images.ts",
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
            },
            **common_nodejs_props
        )
        images_bucket.grant_read(list_images_lambda)

        add_tags_lambda = nodejs.NodejsFunction(self, "AddTagsLambda",
            entry="../lambda/add-tags.ts",
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            **common_nodejs_props
        )
        image_tags_table.grant_write_data(add_tags_lambda)
        tag_images_table.grant_write_data(add_tags_lambda)

        get_tags_lambda = nodejs.NodejsFunction(self, "GetTagsLambda",
            entry="../lambda/get-tags.ts",
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
            },
            **common_nodejs_props
        )
        image_tags_table.grant_read_data(get_tags_lambda)

        get_images_by_tag_lambda = nodejs.NodejsFunction(self, "GetImagesByTagLambda",
            entry="../lambda/get-images-by-tag.ts",
            environment={
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            **common_nodejs_props
        )
        tag_images_table.grant_read_data(get_images_by_tag_lambda)

        api = apigw.RestApi(self, "KoromothViewerApi",
            rest_api_name="Koromoth Viewer Backend API",
            description="Serves presigned URLs for images from S3",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type"],
            ),
        )

        # --- API Gateway Resources ---

        # GET /images
        images = api.root.add_resource("images")
        images.add_method("GET", apigw.LambdaIntegration(list_images_lambda))

        # GET /image/{key}
        image_key = api.root.add_resource("image").add_resource("{key}")
        image_key.add_method("GET", apigw.LambdaIntegration(serve_image_lambda))

        # GET /image/{key}/tags
        image_key_tags = image_key.add_resource("tags")
        image_key_tags.add_method("GET", apigw.LambdaIntegration(get_tags_lambda))
        
        # POST /image/{key}/tags
        image_key_tags.add_method("POST", apigw.LambdaIntegration(add_tags_lambda))

        # GET /tags/{tag}/images
        tags_tag_images = api.root.add_resource("tags").add_resource("{tag}").add_resource("images")
        tags_tag_images.add_method("GET", apigw.LambdaIntegration(get_images_by_tag_lambda))

        # --- CDK Outputs ---
        CfnOutput(self, "UsedS3BucketName",
            value=existing_bucket_name_param.value_as_string,
            description="The name of the S3 bucket used for image storage.",
        )
        CfnOutput(self, "ImageTagsTableName",
            value=image_tags_table.table_name,
            description="The name of the DynamoDB table that stores image tags.",
        )
        CfnOutput(self, "TagImagesTableName",
            value=tag_images_table.table_name,
            description="The name of the DynamoDB table that serves as the inverted index for tags.",
        )

        # API Endpoints
        CfnOutput(self, "ApiUrl",
            value=api.url,
            description="The base URL for the API Gateway.",
        )
        CfnOutput(self, "ListImagesEndpoint",
            value=f"GET {api.url}images",
            description="Lists all image keys.",
        )
        CfnOutput(self, "GetImageEndpoint",
            value=f"GET {api.url}image/{{key}}",
            description="Gets a presigned URL for an image.",
        )
        CfnOutput(self, "GetImageTagsEndpoint",
            value=f"GET {api.url}image/{{key}}/tags",
            description="Gets all tags for an image.",
        )
        CfnOutput(self, "AddImageTagsEndpoint",
            value=f"POST {api.url}image/{{key}}/tags",
            description="Adds one or more tags to an image.",
        )
        CfnOutput(self, "GetImagesByTagEndpoint",
            value=f"GET {api.url}tags/{{tag}}/images",
            description="Gets all images for a specific tag.",
        )

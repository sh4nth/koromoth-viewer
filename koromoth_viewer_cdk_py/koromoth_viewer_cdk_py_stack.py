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

        lambda_entry_path = os.path.join(os.path.dirname(__file__), "..", "lambda")

        serve_image_lambda = nodejs.NodejsFunction(self, "ServeImageLambda",
            project_root=lambda_entry_path,
            entry=os.path.join(lambda_entry_path, "get-image.ts"),
            handler="handler",
            runtime=lambda_.Runtime.NODEJS_20_X,
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
            },
            bundling=nodejs.BundlingOptions(
                force_docker_bundling=False,
            ),
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        images_bucket.grant_read(serve_image_lambda)

        list_images_lambda = nodejs.NodejsFunction(self, "ListImagesLambda",
            project_root=lambda_entry_path,
            entry=os.path.join(lambda_entry_path, "list-images.ts"),
            handler="handler",
            runtime=lambda_.Runtime.NODEJS_20_X,
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
            },
            bundling=nodejs.BundlingOptions(
                force_docker_bundling=False,
            ),
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        images_bucket.grant_read(list_images_lambda)

        add_tags_lambda = nodejs.NodejsFunction(self, "AddTagsLambda",
            project_root=lambda_entry_path,
            entry=os.path.join(lambda_entry_path, "add-tags.ts"),
            handler="handler",
            runtime=lambda_.Runtime.NODEJS_20_X,
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            bundling=nodejs.BundlingOptions(
                force_docker_bundling=False,
            ),
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        image_tags_table.grant_write_data(add_tags_lambda)
        tag_images_table.grant_write_data(add_tags_lambda)

        get_tags_lambda = nodejs.NodejsFunction(self, "GetTagsLambda",
            project_root=lambda_entry_path,
            entry=os.path.join(lambda_entry_path, "get-tags.ts"),
            handler="handler",
            runtime=lambda_.Runtime.NODEJS_20_X,
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
            },
            bundling=nodejs.BundlingOptions(
                force_docker_bundling=False,
            ),
            memory_size=128,
            timeout=Duration.seconds(30),
        )
        image_tags_table.grant_read_data(get_tags_lambda)

        get_images_by_tag_lambda = nodejs.NodejsFunction(self, "GetImagesByTagLambda",
            project_root=lambda_entry_path,
            entry=os.path.join(lambda_entry_path, "get-images-by-tag.ts"),
            handler="handler",
            runtime=lambda_.Runtime.NODEJS_20_X,
            environment={
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            bundling=nodejs.BundlingOptions(
                force_docker_bundling=False,
            ),
            memory_size=128,
            timeout=Duration.seconds(30),
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

        image_resource = api.root.add_resource("image")
        image_key_resource = image_resource.add_resource("{key}")
        image_key_resource.add_method("GET", apigw.LambdaIntegration(serve_image_lambda))

        tags_resource = image_key_resource.add_resource("tags")
        tags_resource.add_method("POST", apigw.LambdaIntegration(add_tags_lambda))
        tags_resource.add_method("GET", apigw.LambdaIntegration(get_tags_lambda))

        images_resource = api.root.add_resource("images")
        images_resource.add_method("GET", apigw.LambdaIntegration(list_images_lambda))

        tags_root_resource = api.root.add_resource("tags")
        tag_resource = tags_root_resource.add_resource("{tag}")
        tag_images_resource = tag_resource.add_resource("images")
        tag_images_resource.add_method("GET", apigw.LambdaIntegration(get_images_by_tag_lambda))

        CfnOutput(self, "GetImageEndpoint",
            value=f"{api.url}image/<YOUR_IMAGE_FILENAME.EXT>",
            description="The API Gateway endpoint URL to get presigned image URLs. Replace <YOUR_IMAGE_FILENAME.EXT> with your S3 image key.",
        )
        CfnOutput(self, "ListImagesEndpoint",
            value=f"{api.url}images",
            description="The API Gateway endpoint URL to list all available images.",
        )
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
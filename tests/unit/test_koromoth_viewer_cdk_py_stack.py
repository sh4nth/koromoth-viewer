import aws_cdk as cdk
import aws_cdk.assertions as assertions
import pytest

from koromoth_viewer_cdk_py.koromoth_viewer_cdk_py_stack import KoromothViewerCdkPyStack


@pytest.fixture(scope="module")
def app():
    """CDK App fixture for the entire test module."""
    return cdk.App()


@pytest.fixture(scope="module")
def stack(app):
    """CDK Stack fixture for the entire test module."""
    return KoromothViewerCdkPyStack(app, "TestStack")


@pytest.fixture(scope="module")
def template(stack):
    """CDK Template fixture for the entire test module."""
    return assertions.Template.from_stack(stack)


def test_dynamodb_tables_created(template):
    template.resource_count_is("AWS::DynamoDB::Table", 2)
    assert_dynamodb_table(template, {"ImageKey": ("S", "HASH"), "GSI1PK": ("S", None)})
    assert_dynamodb_table(template, {"Tag": ("S", "HASH"), "ImageKey": ("S", "RANGE")})


def test_lambda_functions_created_with_correct_properties(template, stack):
    assert_lambda_environment(
        template,
        "GetImagesLambda",
        ["IMAGE_TAGS_TABLE_NAME", "TAG_IMAGES_TABLE_NAME"],
    )
    assert_lambda_environment(
        template,
        "DeleteTagsLambda",
        ["IMAGE_TAGS_TABLE_NAME", "TAG_IMAGES_TABLE_NAME"],
    )
    assert_lambda_environment(
        template,
        "AddTagsLambda",
        ["IMAGE_TAGS_TABLE_NAME", "TAG_IMAGES_TABLE_NAME"],
    )
    assert_lambda_environment(
        template, "GetTagsLambda", ["IMAGE_TAGS_TABLE_NAME"]
    )
    assert_lambda_environment(template, "ServeImageLambda", ["BUCKET_NAME"])
    assert_lambda_environment(
        template,
        "ThumbnailerLambda",
        ["THUMBNAIL_BUCKET_NAME", "IMAGE_TAGS_TABLE_NAME"],
    )

    # There are 3 CDK created lambdas: [
    #  'CustomS3AutoDeleteObjectsCustomResourceProviderHandler',
    #  'BucketNotificationsHandler',
    #  'CustomCDKBucketDeployment'
    #  ]
    # in addition to the 6 we create explicitly.
    template.resource_count_is("AWS::Lambda::Function", 9)


def test_api_gateway_integrations(template, stack):
    assert_api_gateway_integration(
        stack,
        template,
        "GET",
        "GetImagesLambda",
        "/api/images",
    )
    assert_api_gateway_integration(
        stack,
        template,
        "GET",
        "ServeImageLambda",
        "/api/image/{key}",
    )
    assert_api_gateway_integration(
        stack,
        template,
        "GET",
        "GetTagsLambda",
        "/api/image/{key}/tags",
    )
    assert_api_gateway_integration(
        stack,
        template,
        "POST",
        "AddTagsLambda",
        "/api/image/{key}/tags",
    )


def _get_logical_id(stack: cdk.Stack, construct_name: str) -> str:
    """Finds the logical ID of a construct by its name."""
    construct = stack.node.find_child(construct_name)
    return stack.get_logical_id(construct.node.default_child)


def assert_dynamodb_table(
    template: assertions.Template, schema: dict[str, tuple[str, str]]
):
    """Asserts that a DynamoDB table with a specific schema exists."""
    key_schema = []
    attribute_definitions = []

    for attr_name, (attr_type, key_type) in schema.items():
        attribute_definitions.append(
            {"AttributeName": attr_name, "AttributeType": attr_type}
        )
        if key_type:
            key_schema.append({"AttributeName": attr_name, "KeyType": key_type})

    key_schema.sort(key=lambda x: x["KeyType"])

    template.has_resource_properties(
        "AWS::DynamoDB::Table",
        {
            "KeySchema": key_schema,
            "AttributeDefinitions": attribute_definitions,
        },
    )


def assert_lambda_environment(
    template: assertions.Template, function_name: str, expected_vars: list[str]
):
    """Asserts that a Lambda function has specific environment variables."""
    all_functions = template.find_resources("AWS::Lambda::Function")
    matching_functions = [
        resource
        for logical_id, resource in all_functions.items()
        if function_name in logical_id
    ]
    assert (
        len(matching_functions) > 0
    ), f"No Lambda function found with name containing '{function_name}'"
    assert (
        len(matching_functions) == 1
    ), f"Multiple Lambda functions found with name containing '{function_name}'"

    actual_env_vars = matching_functions[0]["Properties"]["Environment"]["Variables"]
    assert(
        actual_env_vars.keys() == set(expected_vars)
    ), f"Actual variables {actual_env_vars} did not match {expected_vars}"


def find_apigw_resource_id_by_path(
    template: assertions.Template, stack: cdk.Stack, api_logical_id: str, path: str
) -> str:
    """Finds the logical ID of an AWS::ApiGateway::Resource by its full path."""
    path_parts = [p for p in path.strip("/").split("/") if p]

    current_parent_id = {"Fn::GetAtt": [api_logical_id, "RootResourceId"]}
    current_resource_logical_id = None

    all_resources = template.find_resources("AWS::ApiGateway::Resource")

    for part in path_parts:
        found_part = False
        for logical_id, props in all_resources.items():
            properties = props["Properties"]
            if (
                properties.get("PathPart") == part
                and properties.get("RestApiId") == {"Ref": api_logical_id}
                and properties.get("ParentId") == current_parent_id
            ):
                current_resource_logical_id = logical_id
                current_parent_id = {"Ref": current_resource_logical_id}
                found_part = True
                break
        if not found_part:
            raise Exception(f"Resource part '{part}' in path '{path}' not found")

    if current_resource_logical_id is None:
        # This case is for the root resource itself but we don't bind anything there
        raise f"Did not find resource ID for {path}"

    return current_resource_logical_id


def assert_api_gateway_integration(
    stack: cdk.Stack,
    template: assertions.Template,
    http_method: str,
    lambda_function_name: str,
    api_path: str,
):
    """Asserts that an API Gateway method is integrated with a specific Lambda."""
    try:
        lambda_logical_id = _get_logical_id(stack, lambda_function_name)
        api_logical_id = _get_logical_id(stack, "KoromothViewerApi")
        resource_logical_id = find_apigw_resource_id_by_path(
            template, stack, api_logical_id, api_path
        )

        template.has_resource_properties(
            "AWS::ApiGateway::Method",
            {
                "HttpMethod": http_method,
                "RestApiId": {"Ref": api_logical_id},
                "ResourceId": {"Ref": resource_logical_id},
                "Integration": {
                    "Uri": {
                        "Fn::Join": [
                            "",
                            [
                                "arn:",
                                {"Ref": "AWS::Partition"},
                                ":apigateway:",
                                {"Ref": "AWS::Region"},
                                ":lambda:path/2015-03-31/functions/",
                                {"Fn::GetAtt": [lambda_logical_id, "Arn"]},
                                "/invocations",
                            ],
                        ]
                    }
                },
            },
        )
    except Exception as e:
        raise Exception(
            f"No API Gateway method found for {http_method} {api_path} integrated with {lambda_function_name}"
        ) from e

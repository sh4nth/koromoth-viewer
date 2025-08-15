import aws_cdk as core
import aws_cdk.assertions as assertions

from koromoth_viewer_cdk_py.koromoth_viewer_cdk_py_stack import KoromothViewerCdkPyStack

# example tests. To run these tests, uncomment this file along with the example
# resource in koromoth_viewer_cdk_py/koromoth_viewer_cdk_py_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = KoromothViewerCdkPyStack(app, "koromoth-viewer-cdk-py")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })

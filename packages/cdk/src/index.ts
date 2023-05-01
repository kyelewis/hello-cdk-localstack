import { App } from "aws-cdk-lib";
import { CdkHelloStack } from "./stack";

const app = new App();
new CdkHelloStack(app, "CdkHelloStack", {});

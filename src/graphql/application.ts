import 'reflect-metadata';
import { createApplication } from 'graphql-modules';
import { scalarsModule } from './modules/common/scalars.module';
import { baseModule } from './modules/common/base.module';
import { healthModule } from './modules/health/health.module';
import { userModule } from './modules/user/user.module';
// Import other modules as they are created
// import { projectModule } from './modules/project/project.module';
// import { issueModule } from './modules/issue/issue.module';
// ... etc

export const application = createApplication({
  modules: [
    scalarsModule,
    baseModule,
    healthModule,
    userModule,
    // Add other modules here
  ],
});

// Export schema and executor for Apollo Server
export const schema = application.schema;
export const createExecutor = () => application.createApolloExecutor();

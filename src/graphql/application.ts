import 'reflect-metadata';
import { createApplication } from 'graphql-modules';
import { scalarsModule } from './modules/common/scalars.module';
import { baseModule } from './modules/common/base.module';
import { healthModule } from './modules/health/health.module';
import { authModule } from './modules/auth/auth.module';
import { userModule } from './modules/user/user.module';
import { projectModule } from './modules/project/project.module';
import { issueModule } from './modules/issue/issue.module';
import { mergeRequestModule } from './modules/mergeRequest/mergeRequest.module';
import { pipelineModule } from './modules/pipeline/pipeline.module';
import { milestoneModule } from './modules/milestone/milestone.module';
import { labelModule } from './modules/label/label.module';
import { taskModule } from './modules/task/task.module';
import { commitModule } from './modules/commit/commit.module';
import { discussionModule } from './modules/discussion/discussion.module';
import { noteModule } from './modules/note/note.module';
import { eventModule } from './modules/event/event.module';
import { pipelineJobModule } from './modules/pipelineJob/pipelineJob.module';
import { namespaceModule } from './modules/namespace/namespace.module';
import { iterationModule } from './modules/iteration/iteration.module';
import { departmentModule } from './modules/department/department.module';
import { attachmentModule } from './modules/attachment/attachment.module';
import { wikiPageModule } from './modules/wikiPage/wikiPage.module';
import { draftNoteModule } from './modules/draftNote/draftNote.module';

export const application = createApplication({
  modules: [
    scalarsModule,
    baseModule,
    healthModule,
    authModule,
    userModule,
    projectModule,
    issueModule,
    mergeRequestModule,
    pipelineModule,
    milestoneModule,
    labelModule,
    taskModule,
    commitModule,
    discussionModule,
    noteModule,
    eventModule,
    pipelineJobModule,
    namespaceModule,
    iterationModule,
    departmentModule,
    attachmentModule,
    wikiPageModule,
    draftNoteModule,
  ],
});

// Export schema and executor for Apollo Server
export const schema = application.schema;
export const createExecutor = () => application.createApolloExecutor();

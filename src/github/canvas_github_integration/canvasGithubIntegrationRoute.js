import express from "express";
import listRepositories from "./actions/listRepositories.js";
import commitChanges from "./actions/commitChanges.js";
import pushChanges from "./actions/pushChanges.js";
import pullChanges from "./actions/pullController.js";
import fileContent from "./actions/getFileContent.js";
import gitContent from "./actions/getRepositoryContent.js";
import gitBranches from "./actions/getRepositoryBranches.js";
import gitFileContent from "./actions/getFileContent.js";
import gitFileCommits from "./actions/getFileCommits.js";
import gitRepoCommits from "./actions/getRepoCommits.js";
import gitFileContentUpdate from "./actions/updateGitHubFileContent.js";
import gitAcfIntegration from "./actions/githubACFIntegration.js";
import gitAcfIntegrationRead from "./actions/githubACFIntegratioonRead.js";
import gitAcfIntegrationDelete from "./actions/githubACFIntegrationDelete.js";
import gitAcfProjects from "./actions/githubAcfProject.js";
import createRepoFile from "./actions/createRepoFile.js";
import geminiGenerateApiCode from "./actions/createGeminiResponseWithMasterData4ApiCanvas.js";
import geminiGenerateUICode from "./actions/createGeminiResponseWithMasterData4UiCanvas.js";
import getRepositoryImportTree from "./actions/getRepositoryImportTree.js";
import createVirtualRepo from "./actions/createVirtualRepo.js";
import getGithubToken from "./actions/getGithubToken.js";
import createPullRequest from "./actions/createPullRequest.js";
import mergeToMain from "./actions/mergeToMain.js";
import crdPrFileCntent from "./actions/getGithubContentForCrd.js";
import createCrdFromGithub from "./actions/createCrdFromGithub.js";
import createMerge from "./actions/createMerge.js";
import { 
    addFileChanges, 
    commitFileChanges, 
    pushFileChanges 
  } from './actions/useGithubActions.js';
import { initiateGitHubOAuth, handleGitHubCallback } from "./actions/authGithub.js";
const router = express.Router();

// Get all repositories
router.post("/repos", listRepositories);
router.post("/commit", commitChanges); 
router.post("/push", pushChanges);
router.post("/pull", pullChanges);
router.post("/file-content",fileContent)
router.post("/repo-content",gitContent)
router.post("/repo-branch",gitBranches)
router.post("/repo-file-content",gitFileContent)
router.post("/repo-file-commits",gitFileCommits)
router.post("/repo-commits",gitRepoCommits)
router.post("/repo-import-tree", getRepositoryImportTree)
router.post("/create-crd-from-github", createCrdFromGithub)
router.post("/create-virtual-repo", createVirtualRepo)
router.post("/create-pull-request", createPullRequest)
router.post("/merge-to-main", mergeToMain)
router.post("/get-github-token", getGithubToken)
router.post("/initiate-oauth", initiateGitHubOAuth)
router.post("/oauth-callback", handleGitHubCallback)
router.post("/repo-file-update",gitFileContentUpdate)
router.post("/acf-integration", gitAcfIntegration);
router.post("/acf-integration-read", gitAcfIntegrationRead);
router.post("/acf-integration-delete", gitAcfIntegrationDelete);
router.post("/acf-projects", gitAcfProjects);
router.post('/repo-file-add', addFileChanges);
router.post('/repo-file-commit', commitFileChanges);
router.post('/repo-file-push', pushFileChanges);
router.post('/repo-file-create', createRepoFile);
router.post('/gemini-code', geminiGenerateApiCode);
router.post('/gemini-code-ui', geminiGenerateUICode);
router.post('/pr-file-content',crdPrFileCntent)
router.post('/merge',createMerge)

export default router;
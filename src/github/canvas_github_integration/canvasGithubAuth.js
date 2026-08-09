// routes/githubAuthRoutes.js
import express from "express";
import {
  initiateGitHubOAuth,
  handleGitHubCallback,
  getUserToken
} from "./actions/authGithub.js";

const router = express.Router();

router.post('/login', initiateGitHubOAuth);

router.post('/callback', handleGitHubCallback);

router.post('/users', getUserToken);

export default router;

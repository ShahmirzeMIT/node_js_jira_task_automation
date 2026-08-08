import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import { jiraLogin } from './jira/canvas_login.js';
import { jiraCallback } from './jira/canvas_callback.js';
import jiraRouter from './jira/jira_routes.js';
import githubRouter from './github/canvas_github_integration/canvasGithubIntegrationRoute.js';
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Jira GitHub Automation API is running',
  });
});

app.get('/auth/jira', jiraLogin);
app.get('/auth/jira/callback', jiraCallback);
app.use('/auth/jira', jiraRouter);
app.use('/github', githubRouter);



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

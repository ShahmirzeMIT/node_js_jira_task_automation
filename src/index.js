import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import { jiraLogin } from './jira/canvas_login.js';
import { jiraCallback } from './jira/canvas_callback.js';
import { getAccessibleResources} from './jira//canvas_accessible_resources.js';
import {getIssuesAssignedToUser} from './jira/canvas_get_jira_issue.js';
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
app.get('/auth/jira/resources', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Access token is missing in the Authorization header',
    });
  }

  try {
    const resources = await getAccessibleResources(accessToken);
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Accessible resources retrieved successfully',
      resources,
    });
  } catch (error) {
    console.error('Error retrieving accessible resources:', error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving accessible resources',
      error: error.message,
    });
  }
});

app.get('/auth/jira/issues', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const { cloudId, accountId, maxResults, fields, statuses, nextPageToken } = req.query;

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Access token is missing in the Authorization header',
    });
  }

  if (!cloudId || !accountId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'cloudId and accountId are required query parameters',
    });
  }

  try {
    const options = {
      maxResults: maxResults ? parseInt(maxResults) : undefined,
      fields: fields ? fields.split(',') : undefined,
      statuses: statuses ? statuses.split(',') : undefined,
      nextPageToken,
    };

    const issuesData = await getIssuesAssignedToUser(accessToken, cloudId, accountId, options);

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Issues assigned to user retrieved successfully',
      data: issuesData,
    });
  } catch (error) {
    console.error('Error retrieving issues assigned to user:', error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving issues assigned to user',
      error: error.message,
    });
  }
});



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

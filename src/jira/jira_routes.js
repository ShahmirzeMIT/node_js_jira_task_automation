import express from 'express';
import { getAccessibleResources } from './canvas_accessible_resources.js';
import { getIssuesAssignedToUser } from './canvas_get_jira_issue.js';

const router = express.Router();

const getAccessToken = (req) => req.headers.authorization?.split(' ')[1];

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? value.split(',') : undefined;
};

router.post('/resources', async (req, res) => {
  const accessToken = getAccessToken(req);

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
    console.error('Error retrieving accessible resources:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving accessible resources',
    });
  }
});

router.post('/issues', async (req, res) => {
  const accessToken = getAccessToken(req);
  const { cloudId, accountId, maxResults, fields, statuses, nextPageToken } = req.body ?? {};

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
      message: 'cloudId and accountId are required in the request body',
    });
  }

  try {
    const issuesData = await getIssuesAssignedToUser(accessToken, cloudId, accountId, {
      maxResults: maxResults ? Number.parseInt(maxResults, 10) : undefined,
      fields: toArray(fields),
      statuses: toArray(statuses),
      nextPageToken,
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Issues assigned to user retrieved successfully',
      data: issuesData,
    });
  } catch (error) {
    console.error('Error retrieving issues assigned to user:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving issues assigned to user',
    });
  }
});

export default router;

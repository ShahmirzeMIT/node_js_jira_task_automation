import express from 'express';
import { getAccessibleResources } from './canvas_accessible_resources.js';
import { getIssuesAssignedToUser } from './canvas_get_jira_issue.js';

import { getValidAccessToken } from './canvas_token_manager.js';

const router = express.Router();

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? value.split(',') : undefined;
};

// Central place to turn a getValidAccessToken() failure into the right
// HTTP response, since several routes need this same handling.
const handleTokenError = (error, res) => {
  const msg = error.message || '';

  if (msg.includes('No stored Jira connection')) {
    return res.status(404).json({
      success: false,
      status: 404,
      message: 'No Jira connection found for this accountId. Please connect Jira first.',
    });
  }

  if (msg.includes('disconnected')) {
    return res.status(401).json({
      success: false,
      status: 401,
      message: 'This Jira connection was disconnected. Please reconnect.',
    });
  }

  if (msg.includes('No refresh token')) {
    return res.status(401).json({
      success: false,
      status: 401,
      message: 'No refresh token available. Please reconnect Jira.',
    });
  }

  // invalid_grant from Atlassian bubbles up as an axios error, not our
  // own thrown Error, so check the response body shape too.
  if (error.response?.data?.error === 'invalid_grant') {
    return res.status(401).json({
      success: false,
      status: 401,
      message: 'Jira session expired and could not be refreshed. Please reconnect Jira.',
    });
  }

  return null; // not a token-related error — let the caller handle it
};

router.post('/resources', async (req, res) => {
  const { accountId } = req.body ?? {};

  if (!accountId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'accountId is required in the request body',
    });
  }

  try {
    const accessToken = await getValidAccessToken(accountId);
    const resources = await getAccessibleResources(accessToken);
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Accessible resources retrieved successfully',
      resources,
    });
  } catch (error) {
    const tokenErrorResponse = handleTokenError(error, res);
    if (tokenErrorResponse) return tokenErrorResponse;

    console.error('Error retrieving accessible resources:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving accessible resources',
    });
  }
});

router.post('/issues', async (req, res) => {
  const { cloudId, accountId, maxResults, fields, statuses, nextPageToken } = req.body ?? {};

  if (!cloudId || !accountId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'cloudId and accountId are required in the request body',
    });
  }

  try {
    const accessToken = await getValidAccessToken(accountId);

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
    const tokenErrorResponse = handleTokenError(error, res);
    if (tokenErrorResponse) return tokenErrorResponse;

    console.error('Error retrieving issues assigned to user:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving issues assigned to user',
    });
  }
});


export default router;
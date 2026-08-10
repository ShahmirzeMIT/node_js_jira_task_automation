import express from 'express';
import { getAccessibleResources } from './canvas_accessible_resources.js';
import { getIssuesAssignedToUser, getMyAssignedIssues } from './canvas_get_jira_issue.js';

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
  const { cloudId, accountId, maxResults, fields, statuses, startAt } = req.body || {};

  // Debug log
  console.log('📥 Request body:', req.body);
  console.log('🔑 Access token exists:', !!accessToken);

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Access token is missing in the Authorization header',
    });
  }

  if (!cloudId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'cloudId is required in the request body',
    });
  }

  if (!accountId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'accountId is required in the request body',
    });
  }

  try {
    console.log('🔄 Fetching issues for account:', accountId);
    
    const issuesData = await getIssuesAssignedToUser(
      accessToken, 
      cloudId, 
      accountId, 
      {
        maxResults: maxResults ? Number.parseInt(maxResults, 10) : 50,
        fields: toArray(fields) || ['summary', 'status', 'priority', 'project', 'issuetype'],
        statuses: toArray(statuses) || [],
        startAt: startAt ? Number.parseInt(startAt, 10) : 0,
      }
    );

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Issues assigned to user retrieved successfully',
      data: issuesData,
    });
  } catch (error) {
    console.error('❌ Error retrieving issues:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Daha ətraflı error cavabı
    return res.status(error.response?.status || 500).json({
      success: false,
      status: error.response?.status || 500,
      message: 'Error retrieving issues assigned to user',
      error: error.response?.data || error.message,
    });
  }
});

// Alternativ endpoint - current user üçün
router.post('/my-issues', async (req, res) => {
  const accessToken = getAccessToken(req);
  const { cloudId, maxResults, fields, statuses, startAt } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Access token is missing in the Authorization header',
    });
  }

  if (!cloudId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'cloudId is required in the request body',
    });
  }

  try {
    const issuesData = await getMyAssignedIssues(accessToken, cloudId, {
      maxResults: maxResults ? Number.parseInt(maxResults, 10) : 50,
      fields: toArray(fields) || ['summary', 'status', 'priority', 'project', 'issuetype'],
      statuses: toArray(statuses) || [],
      startAt: startAt ? Number.parseInt(startAt, 10) : 0,
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'My issues retrieved successfully',
      data: issuesData,
    });
  } catch (error) {
    console.error('Error retrieving my issues:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Error retrieving my issues',
    });
  }
});

export default router;
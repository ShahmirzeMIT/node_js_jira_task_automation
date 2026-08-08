import axios from 'axios';
import { db } from '../../config/firebase.js';

export const jiraCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Authorization code is missing',
    });
  }

  try {
    const response = await axios.post(
      'https://auth.atlassian.com/oauth/token',
      {
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: process.env.JIRA_REDIRECT_URI,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in,
    } = response.data;

    const resourcesResponse = await axios.get(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json',
        },
      }
    );

    const resources = resourcesResponse.data;

    const jiraConnection = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      resources,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db
      .collection('jira_connections')
      .add(jiraConnection);

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Jira connected successfully',
      connectionId: docRef.id,
      expires_in,
      resources,
    });

  } catch (error) {
    console.error(
      'Jira OAuth Error:',
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      status: error.response?.status || 500,
      message: 'Jira authentication failed',
      error: error.response?.data || error.message,
    });
  }
};
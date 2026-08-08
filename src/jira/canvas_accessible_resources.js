import axios from 'axios';


// Jira API base URLs
const JIRA_API_BASE = 'https://api.atlassian.com';

export const getAccessibleResources = async (accessToken) => {
  try {
    const response = await axios.get(
      `${JIRA_API_BASE}/oauth/token/accessible-resources`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting accessible resources:', error.response?.data || error.message);
    throw error;
  }
};

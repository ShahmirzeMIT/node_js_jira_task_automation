import axios from 'axios';

// Jira API base URLs
const JIRA_API_BASE = 'https://api.atlassian.com';

export const getJiraIssue = async (accessToken, cloudId, issueKey) => {
  try {
    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error getting issue ${issueKey}:`, error.response?.data || error.message);
    throw error;
  }
};

export const getTransitions = async (accessToken, cloudId, issueKey) => {
  try {
    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error getting transitions for ${issueKey}:`, error.response?.data || error.message);
    throw error;
  }
};

export const changeIssueStatus = async (accessToken, cloudId, issueKey, transitionId) => {
  try {
    const response = await axios.post(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
      {
        transition: {
          id: transitionId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error changing status for ${issueKey}:`, error.response?.data || error.message);
    throw error;
  }
};

// New function: Search for issues with JQL
export const searchJiraIssues = async (accessToken, cloudId, jql, fields = ['*all']) => {
  try {
    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        params: {
          jql,
          fields: fields.join(','),
          maxResults: 100,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error searching issues:', error.response?.data || error.message);
    throw error;
  }
};

// New function: Add comment to issue
export const addCommentToIssue = async (accessToken, cloudId, issueKey, comment) => {
  try {
    const response = await axios.post(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/comment`,
      {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error adding comment to ${issueKey}:`, error.response?.data || error.message);
    throw error;
  }
};

// New function: Get issue assignees
export const getIssueAssignees = async (accessToken, cloudId, issueKey) => {
  try {
    const issue = await getJiraIssue(accessToken, cloudId, issueKey);
    return {
      assignee: issue.fields.assignee,
      reporter: issue.fields.reporter,
    };
  } catch (error) {
    console.error(`Error getting assignees for ${issueKey}:`, error);
    throw error;
  }
};

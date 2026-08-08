import axios from 'axios';

export const getAccessibleResources = async (accessToken) => {
  const response = await axios.get(
    'https://api.atlassian.com/oauth/token/accessible-resources',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  return response.data;
};

export const getJiraIssue = async (
  accessToken,
  cloudId,
  issueKey
) => {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  return response.data;
};

export const getTransitions = async (
  accessToken,
  cloudId,
  issueKey
) => {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  return response.data;
};

export const changeIssueStatus = async (
  accessToken,
  cloudId,
  issueKey,
  transitionId
) => {
  const response = await axios.post(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
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
};
import axios from 'axios';
import { db } from '../../config/firebase.js';

// Jira API base URLs
const JIRA_API_BASE = 'https://api.atlassian.com';

// Mövcud funksiya - tək issue üçün
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

// YENİ FUNKSİYA: İstifadəçiyə assigne olunmuş bütün issue-lar
export const getMyAssignedIssues = async (accessToken, cloudId, options = {}) => {
  try {
    const {
      maxResults = 50,
      fields = ['summary', 'status', 'priority', 'project', 'issuetype', 'created', 'updated'],
      statuses = [], // Məsələn: ['"In Progress"', '"To Do"']
      projectKeys = [], // Məsələn: ['PROJ1', 'PROJ2']
      nextPageToken,
      includeSubtasks = false
    } = options;

    // JQL query - assignee = currentUser()
    let jql = 'assignee = currentUser()';
    
    // Əlavə filtrlər
    if (statuses.length > 0) {
      jql += ` AND status IN (${statuses.map(s => `"${s}"`).join(', ')})`;
    }
    
    if (projectKeys.length > 0) {
      jql += ` AND project IN (${projectKeys.map(p => `"${p}"`).join(', ')})`;
    }
    
    if (!includeSubtasks) {
      jql += ' AND type != Sub-task';
    }

    // Issue-ları axtar
    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        params: {
          jql,
          fields: fields.join(','),
          maxResults,
          nextPageToken,
          expand: ['renderedFields', 'names', 'schema']
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    return {
      success: true,
      total: response.data.total,
      issues: response.data.issues,
      maxResults: response.data.maxResults,
      nextPageToken: response.data.nextPageToken,
      isLast: response.data.isLast ?? !response.data.nextPageToken
    };

  } catch (error) {
    console.error('Error getting assigned issues:', error.response?.data || error.message);
    throw error;
  }
};

// YENİ FUNKSİYA: Müəyyən istifadəçiyə assigne olunmuş issue-lar
export const getIssuesAssignedToUser = async (accessToken, cloudId, accountId, options = {}) => {
  try {
    const {
      maxResults = 50,
      fields = ['summary', 'status', 'priority', 'project', 'issuetype', 'created', 'updated'],
      statuses = [],
      nextPageToken,
    } = options;

    let jql = `assignee = "${accountId}"`;
    
    if (statuses.length > 0) {
      jql += ` AND status IN (${statuses.map(s => `"${s}"`).join(', ')})`;
    }

    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        params: {
          jql,
          fields: fields.join(','),
          maxResults,
          nextPageToken,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    return {
      success: true,
      total: response.data.total,
      issues: response.data.issues,
      maxResults: response.data.maxResults,
      nextPageToken: response.data.nextPageToken,
      isLast: response.data.isLast ?? !response.data.nextPageToken
    };

  } catch (error) {
    console.error(`Error getting issues assigned to user ${accountId}:`, error.response?.data || error.message);
    throw error;
  }
};

// YENİ FUNKSİYA: Bütün issue-ları səhifələrlə almaq (pagination)
export const getAllAssignedIssuesPaginated = async (accessToken, cloudId, options = {}) => {
  try {
    const {
      maxResults = 100,
      fields = ['summary', 'status', 'priority', 'project', 'issuetype', 'created', 'updated'],
      statuses = [],
      maxPages = 10
    } = options;

    let allIssues = [];
    let nextPageToken;
    let total = 0;
    let pageCount = 0;
    let isLast = false;

    while (!isLast && pageCount < maxPages) {
      const result = await getMyAssignedIssues(accessToken, cloudId, {
        maxResults,
        fields,
        statuses,
        nextPageToken,
        includeSubtasks: false
      });

      allIssues = allIssues.concat(result.issues);
      total = result.total;
      isLast = result.isLast;
      nextPageToken = result.nextPageToken;
      pageCount++;

      console.log(`📄 Page ${pageCount}: ${result.issues.length} issues loaded`);
    }

    return {
      success: true,
      total,
      issues: allIssues,
      pagesLoaded: pageCount,
      totalLoaded: allIssues.length
    };

  } catch (error) {
    console.error('Error getting all assigned issues:', error.message);
    throw error;
  }
};

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
      statuses = [],
      projectKeys = [],
      nextPageToken,
      includeSubtasks = false
    } = options;

    // JQL query - assignee = currentUser()
    let jql = 'assignee = currentUser()';
    
    if (statuses.length > 0) {
      jql += ` AND status IN (${statuses.map(s => `"${s}"`).join(', ')})`;
    }
    
    if (projectKeys.length > 0) {
      jql += ` AND project IN (${projectKeys.map(p => `"${p}"`).join(', ')})`;
    }
    
    if (!includeSubtasks) {
      jql += ' AND issuetype != Sub-task';
    }

    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/search`,
      {
        params: {
          jql,
          fields: fields.join(','),
          maxResults,
          startAt: nextPageToken ? parseInt(nextPageToken) : 0,
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
      startAt: response.data.startAt,
      isLast: response.data.startAt + response.data.issues.length >= response.data.total
    };

  } catch (error) {
    console.error('Error getting assigned issues:', error.response?.data || error.message);
    throw error;
  }
};

// YENİ FUNKSİYA: Müəyyən istifadəçiyə assigne olunmuş issue-lar - DÜZƏLİŞ EDİLDİ
export const getIssuesAssignedToUser = async (accessToken, cloudId, accountId, options = {}) => {
  try {
    const {
      maxResults = 50,
      fields = ['summary', 'status', 'priority', 'project', 'issuetype', 'created', 'updated'],
      statuses = [],
      startAt = 0,
    } = options;

    // DÜZƏLİŞ: Account ID düzgün formatda olmalıdır
    // JQL-də accountId düzgün istifadə edilməlidir
    let jql = `assignee = "${accountId}"`;
    
    if (statuses.length > 0) {
      jql += ` AND status IN (${statuses.map(s => `"${s}"`).join(', ')})`;
    }

    console.log('🔍 JQL Query:', jql);
    console.log('👤 Account ID:', accountId);
    console.log('☁️ Cloud ID:', cloudId);

    const response = await axios.get(
      `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/search`,
      {
        params: {
          jql,
          fields: fields.join(','),
          maxResults,
          startAt,
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
      startAt: response.data.startAt,
      isLast: response.data.startAt + response.data.issues.length >= response.data.total
    };

  } catch (error) {
    console.error('Error details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
};

// Bütün issue-ları səhifələrlə almaq
export const getAllAssignedIssuesPaginated = async (accessToken, cloudId, options = {}) => {
  try {
    const {
      maxResults = 100,
      fields = ['summary', 'status', 'priority', 'project', 'issuetype', 'created', 'updated'],
      statuses = [],
      maxPages = 10
    } = options;

    let allIssues = [];
    let startAt = 0;
    let total = 0;
    let pageCount = 0;
    let isLast = false;

    while (!isLast && pageCount < maxPages) {
      const result = await getMyAssignedIssues(accessToken, cloudId, {
        maxResults,
        fields,
        statuses,
        startAt,
        includeSubtasks: false
      });

      allIssues = allIssues.concat(result.issues || []);
      total = result.total || 0;
      isLast = result.isLast || false;
      startAt += result.issues?.length || 0;
      pageCount++;

      console.log(`📄 Page ${pageCount}: ${result.issues?.length || 0} issues loaded`);
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
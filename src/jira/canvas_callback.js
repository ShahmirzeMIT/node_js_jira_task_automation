import axios from 'axios';
import { db } from '../../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export const jiraCallback = async (req, res) => {
  const { code, error, error_description: errorDescription } = req.query;

  // This is populated from Jira's /myself response after OAuth succeeds.
  let userId = null;
  let userIdSource = 'jira_account_id';

  // ============================================
  // 2. ERROR HANDLING
  // ============================================
  if (error) {
    console.error('❌ Jira OAuth error:', error, errorDescription);
    return res.status(400).json({
      success: false,
      message: 'Jira authorization was declined or rejected',
      error,
      details: errorDescription,
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Authorization code is missing',
    });
  }

  // ============================================
  // 1. TOKEN EXCHANGE
  // ============================================
  try {
    console.log('🔄 Exchanging code for tokens...');

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
        timeout: 10000, // 10 saniyə timeout
      }
    );

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      scope,
      token_type: tokenType
    } = response.data;

    console.log('✅ Tokens received successfully');

    // ============================================
    // 4. GET ACCESSIBLE RESOURCES
    // ============================================
    console.log('🔄 Fetching accessible resources...');

    const resourcesResponse = await axios.get(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    );

    const resources = resourcesResponse.data;

    if (!resources || resources.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No Jira resources found for this user',
        suggestion: 'Make sure your Jira account has at least one site'
      });
    }

    console.log(`✅ Found ${resources.length} resources`);

    // ============================================
    // 5. GET PRIMARY CLOUD ID
    // ============================================
    const cloudId = resources[0].id;
    console.log(`☁️ Primary cloud ID: ${cloudId}`);

    // ============================================
    // 6. GET JIRA USER INFO (MYSELF)
    // ============================================
    console.log('🔄 Fetching Jira user info...');

    let jiraUserInfo = null;
    let userInfoError = null;

    try {
      const userInfoResponse = await axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          timeout: 10000,
        }
      );
      jiraUserInfo = userInfoResponse.data;
      console.log('✅ Jira user info received');
    } catch (error) {
      userInfoError = error;
      console.error('❌ Could not fetch Jira user info:', error.message);

      // 3 dəfə təkrar cəhd et
      for (let i = 1; i <= 3; i++) {
        try {
          console.log(`🔄 Retry ${i}/3...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * i));
          const userInfoResponse = await axios.get(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
              timeout: 10000,
            }
          );
          jiraUserInfo = userInfoResponse.data;
          console.log('✅ Jira user info received on retry');
          userInfoError = null;
          break;
        } catch (retryError) {
          console.error(`❌ Retry ${i} failed:`, retryError.message);
          if (i === 3) userInfoError = retryError;
        }
      }
    }

    if (!jiraUserInfo) {
      return res.status(502).json({
        success: false,
        message: 'Failed to fetch Jira user information after multiple attempts',
        error: userInfoError?.message || 'Unknown error',
        suggestion: 'Check if the Jira API is accessible and token is valid'
      });
    }

    // ============================================
    // 7. EXTRACT JIRA USER DATA
    // ============================================
    const jiraAccountId = jiraUserInfo.accountId;
    userId = jiraAccountId;
    const jiraUserEmail = jiraUserInfo.emailAddress || null;
    const jiraDisplayName = jiraUserInfo.displayName || null;
    const jiraAccountType = jiraUserInfo.accountType || null;
    const jiraAvatarUrl = jiraUserInfo.avatarUrls?.['48x48'] ||
                          jiraUserInfo.avatarUrls?.['32x32'] ||
                          null;
    const timezone = jiraUserInfo.timezone || null;
    const locale = jiraUserInfo.locale || null;
    const groups = jiraUserInfo.groups?.items?.map(g => g.name) || [];

    console.log(`👤 Jira user: ${jiraDisplayName} (${jiraAccountId})`);
    console.log(`📧 Email: ${jiraUserEmail}`);
    console.log(`🌍 Timezone: ${timezone}`);

    // ============================================
    // 8. CHECK FOR EXISTING CONNECTION
    // ============================================
    const jiraUserRef = db.collection('jira_users').doc(userId);
    const existingDoc = await jiraUserRef.get();

    let isReconnect = false;
    let oldJiraAccountId = null;

    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      oldJiraAccountId = existingData.jiraAccountId;

      if (oldJiraAccountId !== jiraAccountId) {
        console.warn(`⚠️ User ${userId} reconnecting with different Jira account: ${oldJiraAccountId} -> ${jiraAccountId}`);
        isReconnect = true;
      } else {
        console.log(`🔄 User ${userId} refreshing connection for same Jira account`);
        isReconnect = false;
      }
    }

    // ============================================
    // 9. SAVE TO FIREBASE - jira_users
    // ============================================
    console.log('💾 Saving to Firebase...');

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Generate unique ID for this session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const jiraUserData = {
      // Əsas identifikatorlar
      userId,
      jiraAccountId,
      jiraUserEmail,
      jiraDisplayName,
      jiraAccountType,

      // Token məlumatları
      accessToken,
      refreshToken,
      expiresIn,
      expiresAt,
      scope,
      tokenType,

      // Session məlumatları
      currentSessionId: sessionId,
      previousSessionId: existingDoc.exists ? existingDoc.data().currentSessionId : null,

      // Cloud məlumatları
      defaultCloudId: cloudId,
      resources: resources.map((r, index) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        isActive: r.isActive,
        avatarUrl: r.avatarUrl || null,
        isDefault: r.id === cloudId,
        order: index
      })),
      totalResources: resources.length,

      // Jira user metadata
      jiraAvatarUrl,
      timezone,
      locale,
      groups,

      // Connection metadata
      isActive: true,
      connectedAt: existingDoc.exists ? existingDoc.data().connectedAt : now,
      lastUpdated: now,
      lastSyncAt: now,
      reconnectCount: existingDoc.exists ? (existingDoc.data().reconnectCount || 0) + (isReconnect ? 1 : 0) : 0,
      previousJiraAccountId: oldJiraAccountId || null,

      // Təhlükəsizlik
      lastIP: req.ip || req.connection?.remoteAddress || null,
      lastUserAgent: req.headers['user-agent'] || null,

      // Timestamp (Firebase server timestamp)
      _updatedAt: FieldValue.serverTimestamp(),
    };

    await jiraUserRef.set(jiraUserData, { merge: true });
    console.log('✅ Jira user data saved to Firebase');

    // ============================================
    // 10. UPDATE USERS COLLECTION (OPSIONAL)
    // ============================================
    try {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
        'jiraIntegration': {
          connected: true,
          jiraAccountId,
          jiraDisplayName,
          jiraUserEmail,
          defaultCloudId: cloudId,
          connectedAt: now,
          lastUpdated: now,
          sessionId: sessionId
        },
        lastActivityAt: now
      });
      console.log('✅ Users collection updated');
    } catch (error) {
      console.warn('⚠️ Could not update users collection:', error.message);
      // Bu xəta kritik deyil, davam et
    }

    // ============================================
    // 11. SAVE TO JIRA_HISTORY (AUDIT LOG)
    // ============================================
    try {
      const historyRef = db.collection('jira_history').doc(`${userId}_${Date.now()}`);
      await historyRef.set({
        userId,
        jiraAccountId,
        action: isReconnect ? 'reconnect' : 'connect',
        timestamp: now,
        sessionId,
        ip: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        resourcesCount: resources.length,
        defaultCloudId: cloudId
      });
      console.log('✅ History log saved');
    } catch (error) {
      console.warn('⚠️ Could not save history:', error.message);
    }

    // ============================================
    // 12. SEND RESPONSE
    // ============================================
    const responseData = {
      userId,
      jiraAccountId,
      jiraDisplayName,
      jiraUserEmail,
      cloudId,
      expiresIn,
      expiresAt,
      totalResources: resources.length,
      resources: resources.map(r => ({
        id: r.id,
        name: r.name,
        url: r.url,
        isDefault: r.id === cloudId
      })),
      connectedAt: jiraUserData.connectedAt,
      isActive: true,
      isReconnect,
      sessionId
    };

    console.log(`🎉 Jira connection successful for user ${userId}`);

    res.json({
      success: true,
      message: isReconnect ? 'Jira reconnected successfully' : 'Jira connected successfully',
      data: responseData,
      meta: {
        userIdSource,
        timestamp: now,
        version: '1.0.0'
      }
    });

  } catch (error) {
    // ============================================
    // 13. GLOBAL ERROR HANDLING
    // ============================================
    console.error('❌ Jira OAuth failed:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data,
      stack: error.stack
    });

    // Xəta tipinə görə fərqli cavab
    let statusCode = 502;
    let errorMessage = 'Jira authentication failed';
    let details = null;

    if (error.code === 'ECONNABORTED') {
      statusCode = 504;
      errorMessage = 'Request timeout';
      details = 'The request to Jira API timed out. Please try again.';
    } else if (error.response?.status === 400) {
      statusCode = 400;
      errorMessage = 'Invalid request';
      details = error.response?.data?.error_description || 'Invalid parameters';
    } else if (error.response?.status === 401) {
      statusCode = 401;
      errorMessage = 'Unauthorized';
      details = 'Invalid or expired token';
    } else if (error.response?.status === 403) {
      statusCode = 403;
      errorMessage = 'Forbidden';
      details = 'Insufficient permissions';
    } else if (error.response?.status === 429) {
      statusCode = 429;
      errorMessage = 'Too many requests';
      details = 'Rate limit exceeded. Please wait and try again.';
    } else if (error.response?.status === 500 || error.response?.status === 502) {
      statusCode = 502;
      errorMessage = 'Jira server error';
      details = 'Atlassian servers are experiencing issues. Please try again later.';
    }

    const errorResponse = {
      success: false,
      message: errorMessage,
      error: error.response?.data?.error || error.message,
      details: details || error.response?.data?.error_description || null,
      status: statusCode,
      timestamp: new Date().toISOString()
    };

    // Xətanı Firebase-ə logla
    try {
      const errorRef = db.collection('jira_errors').doc(`${userId || 'unknown'}_${Date.now()}`);
      await errorRef.set({
        userId,
        error: errorResponse,
        timestamp: new Date().toISOString(),
        ip: req.ip || null,
        userAgent: req.headers['user-agent'] || null
      });
    } catch (logError) {
      console.error('Could not log error to Firebase:', logError.message);
    }

    res.status(statusCode).json(errorResponse);
  }
};

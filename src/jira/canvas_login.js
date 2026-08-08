export const jiraLogin = (req, res) => {
  const clientId = process.env.JIRA_CLIENT_ID;
  const redirectUri = process.env.JIRA_REDIRECT_URI;

  if (!clientId) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'JIRA_CLIENT_ID is missing',
    });
  }

  if (!redirectUri) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'JIRA_REDIRECT_URI is missing',
    });
  }

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope:
      'read:jira-user read:jira-work write:jira-work offline_access',
    redirect_uri: redirectUri,
    response_type: 'code',
    prompt: 'consent',
  });

  const jiraAuthUrl =
    `https://auth.atlassian.com/authorize?${params.toString()}`;

  console.log('Jira OAuth URL:', jiraAuthUrl);

  return res.status(200).json({
    success: true,
    status: 200,
    message: 'Jira OAuth URL generated successfully',
    url: jiraAuthUrl,
  });
};
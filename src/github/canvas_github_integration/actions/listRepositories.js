import axios from "axios";
import { db } from "../../../../config/firebase.js";

const getGitHubToken = async (userId) => {
  try {
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("GitHub token not found for user");
    return doc.data().accessToken;
  } catch (error) {
    console.error("Error fetching GitHub token:", error);
    throw error;
  }
};

 const listRepositories = async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      error: "User ID is required" ,
      status:400
    });
  }

  try {
    // 1. Get stored GitHub token
    const token = await getGitHubToken(userId);
    
    // 2. Fetch repositories with proper GitHub API headers
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      params: {
        visibility: 'all', // Gets both public and private repos
        affiliation: 'owner', // Only repos user owns
        per_page: 100, // Max allowed
        sort: 'updated' // Most recently updated first
      }
    });

    // 3. Transform response to only include essential repo data
    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      updated_at: repo.updated_at,
      language: repo.language
    }));

    res.status(200).json({ 
      success: true, 
      count: repos.length,
      repos ,
      status:200
    });

  } catch (error) {
    console.error("GitHub API Error:", error.response?.data || error.message);
    
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Failed to fetch repositories";
    
    res.status(status).json({ 
      success: false, 
      error: message,
      details: error.response?.data ,
      status:500
    });
  }
};

export default listRepositories
import axios from "axios";
import { db } from "../../../../config/firebase.js";

const getUserToken = async (userId) => {
    if (!userId || typeof userId !== 'string') {
        throw new Error("Invalid userId provided");
    }
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("Token not found");
    return doc.data().accessToken;
};

const getRepoCommits = async (req, res) => {
    try {
        const { userId, repoFullName, branch, since, until, perPage = 100 } = req.body;
        
        if (!userId || !repoFullName) {
            return res.status(400).json({ 
                error: "Missing required parameters: userId or repoFullName",
                status: 400 
            });
        }

        const [owner, repo] = repoFullName.split('/');
        if (!owner || !repo) {
            return res.status(400).json({ 
                error: "Invalid repoFullName format. Expected 'owner/repo'",
                status: 400 
            });
        }

        const token = await getUserToken(userId);
        
        const params = {
            per_page: perPage || 100
        };

        // Add branch parameter if provided
        if (branch) {
            params.sha = branch;
        }

        // Add date filters if provided
        if (since) {
            params.since = new Date(since).toISOString();
        }
        if (until) {
            params.until = new Date(until).toISOString();
        }

        const commitsResponse = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/commits`,
            {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json"
                },
                params
            }
        );

        const commits = commitsResponse.data || [];

        // Sort commits by date (newest first)
        commits.sort((a, b) => {
            const dateA = new Date(a.commit.author.date || a.commit.committer.date);
            const dateB = new Date(b.commit.author.date || b.commit.committer.date);
            return dateB - dateA;
        });

        // Get detailed commit information
        const commitsWithDetails = await Promise.all(
            commits.map(async (commit) => {
                try {
                    const commitDetailResponse = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: "application/vnd.github.v3+json"
                            }
                        }
                    );

                    const commitDetail = commitDetailResponse.data;
                    
                    return {
                        sha: commit.sha,
                        message: commit.commit.message,
                        author: {
                            name: commit.commit.author.name,
                            email: commit.commit.author.email,
                            date: commit.commit.author.date,
                            login: commit.author?.login,
                            avatar_url: commit.author?.avatar_url
                        },
                        committer: {
                            name: commit.commit.committer.name,
                            email: commit.commit.committer.email,
                            date: commit.commit.committer.date,
                            login: commit.committer?.login,
                            avatar_url: commit.committer?.avatar_url
                        },
                        stats: commitDetail.stats || {
                            additions: 0,
                            deletions: 0,
                            total: 0
                        },
                        files: commitDetail.files?.map(file => ({
                            filename: file.filename,
                            status: file.status,
                            additions: file.additions,
                            deletions: file.deletions,
                            changes: file.changes,
                            patch: file.patch || null
                        })) || [],
                        url: commit.html_url
                    };
                } catch (error) {
                    console.error(`Error fetching commit details for ${commit.sha}:`, error.message);
                    return {
                        sha: commit.sha,
                        message: commit.commit.message,
                        author: {
                            name: commit.commit.author.name,
                            email: commit.commit.author.email,
                            date: commit.commit.author.date,
                            login: commit.author?.login,
                            avatar_url: commit.author?.avatar_url
                        },
                        committer: {
                            name: commit.commit.committer.name,
                            email: commit.commit.committer.email,
                            date: commit.commit.committer.date,
                            login: commit.committer?.login,
                            avatar_url: commit.committer?.avatar_url
                        },
                        stats: {
                            additions: 0,
                            deletions: 0,
                            total: 0
                        },
                        files: [],
                        url: commit.html_url
                    };
                }
            })
        );

        // Sort again after processing
        commitsWithDetails.sort((a, b) => {
            const dateA = new Date(a.author?.date || a.committer?.date);
            const dateB = new Date(b.author?.date || b.committer?.date);
            return dateB.getTime() - dateA.getTime();
        });

        res.status(200).json({
            commits: commitsWithDetails,
            status: 200
        });
    } catch (error) {
        console.error("Error fetching repo commits:", error);
        if (error.response) {
            return res.status(error.response.status).json({
                error: error.response.data?.message || "Failed to fetch commits",
                status: error.response.status
            });
        }
        res.status(500).json({
            error: error.message || "Internal server error",
            status: 500
        });
    }
};

export default getRepoCommits;


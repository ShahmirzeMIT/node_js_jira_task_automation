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

const getFileCommits = async (req, res) => {
    try {
        // Extract parameters from request body
        const { userId, repoFullName, path, branch, perPage = 10, all = false } = req.body;
        
        if (!userId || !repoFullName || !path) {
            return res.status(400).json({ 
                error: "Missing required parameters: userId, repoFullName, or path",
                status: 400 
            });
        }

        // Split repoFullName into owner and repo
        const [owner, repo] = repoFullName.split('/');
        if (!owner || !repo) {
            return res.status(400).json({ 
                error: "Invalid repoFullName format. Expected 'owner/repo'",
                status: 400 
            });
        }

        const token = await getUserToken(userId);
        
        let commits = [];
        
        if (all) {
            // OPTIMIZED: Get commits from specified branch (or default branch and a few active branches if not specified)
            let branchesToCheck = [];
            
            // If branch is specified, use only that branch
            if (branch) {
                branchesToCheck = [{ name: branch }];
            } else {
                // Otherwise, get commits from default branch and a few active branches
                try {
                    // Get default branch (main/master)
                    const repoInfo = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}`,
                        {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: "application/vnd.github.v3+json"
                            }
                        }
                    );
                    const defaultBranch = repoInfo.data.default_branch;
                    if (defaultBranch) {
                        branchesToCheck.push({ name: defaultBranch });
                    }
                    
                    // Get a few most recent branches (limit to 5 for performance)
                    const branchesResponse = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}/branches`,
                        {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: "application/vnd.github.v3+json"
                            },
                            params: {
                                per_page: 5, // Only get first 5 branches
                                page: 1
                            }
                        }
                    );
                    
                    const recentBranches = branchesResponse.data || [];
                    // Add branches that aren't the default branch
                    recentBranches.forEach(branchItem => {
                        if (branchItem.name !== defaultBranch) {
                            branchesToCheck.push(branchItem);
                        }
                    });
                } catch (error) {
                    console.log('Error fetching branches:', error.message);
                    // Fallback: just use default branch
                    branchesToCheck = [{ name: 'main' }, { name: 'master' }];
                }
            }
            
            const commitSet = new Set(); // Use Set to avoid duplicates
            
            // Get commits from each branch (OPTIMIZED: only check path parameter, much faster)
            for (const branch of branchesToCheck) {
                try {
                    // Get commits WITH path filter (this is fast and catches most commits)
                    let branchPage = 1;
                    let hasMoreCommits = true;
                    
                    // Limit to 5 pages (500 commits) per branch for performance
                    while (hasMoreCommits && branchPage <= 5) {
                        try {
                            const branchCommitsResponse = await axios.get(
                                `https://api.github.com/repos/${owner}/${repo}/commits`,
                                {
                                    headers: { 
                                        Authorization: `Bearer ${token}`,
                                        Accept: "application/vnd.github.v3+json"
                                    },
                                    params: {
                                        sha: branch.name,
                                        path: path,
                                        per_page: 100,
                                        page: branchPage
                                    }
                                }
                            );
                            
                            const branchCommits = branchCommitsResponse.data || [];
                            if (branchCommits.length === 0) {
                                hasMoreCommits = false;
                            } else {
                                branchCommits.forEach(commit => {
                                    if (!commitSet.has(commit.sha)) {
                                        commitSet.add(commit.sha);
                                        commits.push(commit);
                                    }
                                });
                                branchPage++;
                            }
                        } catch (pathError) {
                            hasMoreCommits = false;
                        }
                    }
                } catch (branchError) {
                    console.log(`Error fetching commits from branch ${branch.name}:`, branchError.message);
                    // Continue with other branches
                }
            }
            
            // Note: Default branch commits are already included in branchesToCheck above
        } else {
            // Get commits for the file from specified branch (or default branch if not specified)
            const branchToUse = branch || 'main';
            const commitsResponse = await axios.get(
                `https://api.github.com/repos/${owner}/${repo}/commits`,
                {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json"
                    },
                    params: {
                        sha: branchToUse,
                        path: path,
                        per_page: perPage || 10
                    }
                }
            );

            commits = commitsResponse.data || [];
        }
        
        // Sort commits by date (newest first) to ensure we get the latest commits
        commits.sort((a, b) => {
            const dateA = new Date(a.commit?.author?.date || a.commit?.committer?.date || a.author?.date || a.committer?.date);
            const dateB = new Date(b.commit?.author?.date || b.commit?.committer?.date || b.author?.date || b.committer?.date);
            return dateB - dateA; // Newest first
        });
        
        // OPTIMIZED: Limit commits when all=true to avoid too many API calls
        // Take only the first perPage commits (latest ones) if not getting all
        // If all=true, limit to max 50 commits for performance
        const maxCommits = all ? Math.min(50, perPage || 50) : (perPage || 10);
        const latestCommits = commits.slice(0, maxCommits);
        
        // For each commit, get the diff and file content at that commit
        const commitsWithDetails = await Promise.all(
            latestCommits.map(async (commit, commitIndex) => {
                try {
                    // Get commit details with diff (with timeout to avoid hanging)
                    const commitDetailResponse = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
                        {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: "application/vnd.github.v3+json"
                            },
                            timeout: 10000 // 10 second timeout per commit
                        }
                    );

                    const commitDetail = commitDetailResponse.data;
                    
                    // Find the file in the commit's files array
                    const fileChange = commitDetail.files?.find(f => f.filename === path || f.filename === `/${path}`);
                    
                    // OPTIMIZED: Only get file content for first 10 commits to improve performance
                    // File content is not critical for commit history display
                    let fileContentAtCommit = null;
                    if (commitIndex < 10) {
                        try {
                            const fileContentResponse = await axios.get(
                                `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${commit.sha}`,
                                {
                                    headers: { 
                                        Authorization: `Bearer ${token}`,
                                        Accept: "application/vnd.github.v3+raw"
                                    },
                                    timeout: 5000 // 5 second timeout
                                }
                            );
                            
                            if (fileContentResponse.data && fileContentResponse.data.content) {
                                fileContentAtCommit = Buffer.from(fileContentResponse.data.content, 'base64').toString();
                            } else if (typeof fileContentResponse.data === 'string') {
                                fileContentAtCommit = fileContentResponse.data;
                            }
                        } catch (fileError) {
                            // File might not exist at this commit, that's okay
                            // Don't log to avoid spam
                        }
                    }

                    return {
                        sha: commit.sha,
                        message: commit.commit.message,
                        author: {
                            name: commit.commit.author.name,
                            email: commit.commit.author.email,
                            date: commit.commit.author.date,
                            login: commit.author?.login || null,
                            avatar_url: commit.author?.avatar_url || null
                        },
                        committer: {
                            name: commit.commit.committer.name,
                            email: commit.commit.committer.email,
                            date: commit.commit.committer.date
                        },
                        stats: fileChange ? {
                            additions: fileChange.additions || 0,
                            deletions: fileChange.deletions || 0,
                            changes: fileChange.changes || 0
                        } : null,
                        patch: fileChange?.patch || null,
                        fileContent: fileContentAtCommit,
                        url: commit.html_url
                    };
                } catch (error) {
                    console.error(`Error fetching details for commit ${commit.sha}:`, error);
                    // Return basic commit info if detail fetch fails
                    return {
                        sha: commit.sha,
                        message: commit.commit.message,
                        author: {
                            name: commit.commit.author.name,
                            email: commit.commit.author.email,
                            date: commit.commit.author.date,
                            login: commit.author?.login || null,
                            avatar_url: commit.author?.avatar_url || null
                        },
                        committer: {
                            name: commit.commit.committer.name,
                            email: commit.commit.committer.email,
                            date: commit.commit.committer.date
                        },
                        stats: null,
                        patch: null,
                        fileContent: null,
                        url: commit.html_url,
                        error: error.message
                    };
                }
            })
        );

        // Sort commits by date again after processing (newest first)
        commitsWithDetails.sort((a, b) => {
            const dateA = new Date(a.author?.date || a.committer?.date);
            const dateB = new Date(b.author?.date || b.committer?.date);
            return dateB - dateA; // Newest first
        });

        res.status(200).json({ 
            commits: commitsWithDetails,
            status: 200 
        });
    } catch (error) {
        console.error("Error fetching file commits:", error);
        res.status(500).json({ 
            error: error.response?.data?.message || error.message || "Unknown error occurred",
            status: 500 
        });
    }
};

export default getFileCommits;


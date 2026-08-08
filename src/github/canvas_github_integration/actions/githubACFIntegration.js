import { db } from "../../../../config/firebase.js";
import { GetCurrentDateTime } from "../../../../utility/CommonUtils.js";
import { nanoid } from "nanoid";
const githubACFIntegration = async (req, res) => {
  try {
    const { project_id, owner, repo, filename, branch, type, api_id, api_name } = req.body;

    if (!project_id || !owner || !repo || !filename || !type || !api_id) {
      return res.status(400).json({
        error: "Missing required fields: project_id, owner, repo, filename, type, api_id",
        status: 400,
      });
    }

    // First collection: canvas_git_file_relation (document ID = api_id)
    const docRef = db.collection("canvas_git_file_relation").doc(api_id);
    const docSnapshot = await docRef.get();

    const newEntry = {
      id: nanoid(),
      project_id,
      owner,
      repo,
      filename,
      branch: branch || "main",
      type,
      canvas_id: api_id,
      api_name
    };

    if (docSnapshot.exists) {
      const existingData = docSnapshot.data();
      const existingProjects = existingData.projects || [];

      const projectIndex = existingProjects.findIndex(p => p.api_id === api_id);

      if (projectIndex !== -1) {
        const existingProject = existingProjects[projectIndex];
        let hasChanges = false;

        // Compare each field
        for (const key in newEntry) {
          if (newEntry[key] !== existingProject[key]) {
            existingProjects[projectIndex][key] = newEntry[key];
            hasChanges = true;
          }
        }

        if (!hasChanges) {
          return res.status(200).json({
            message: `No update needed: GitHub data is already up-to-date for project ${project_id}`,
            status: 200,
          });
        }

        await docRef.set(
          {
            projects: existingProjects,
            updated_at: GetCurrentDateTime(),
          },
          { merge: true }
        );
      } else {
        existingProjects.push(newEntry);
        await docRef.set(
          {
            projects: existingProjects,
            updated_at: GetCurrentDateTime(),
          },
          { merge: true }
        );
      }
    } else {
      // Create new document with first project entry
      await docRef.set({
        projects: [newEntry],
        created_at: GetCurrentDateTime(),
      });
    }

    // Second collection: git_file_canvas_relation (document ID = projectId_owner_repo_fileName)
    const gitCanvasDocId = `${project_id}_${owner}_${repo}_${filename}`;
    const gitCanvasRef = db.collection("git_file_canvas_relation").doc(gitCanvasDocId);
    const newGitCanvasEntry = {
      id: nanoid(),
      canvas_id: api_id,
      canvas_type: type,
      file_name: filename,
      owner,
      project: project_id,
      repo,
      branch: branch || "main",
      updated_at: GetCurrentDateTime()
    };

    // Set or update the document in git_file_canvas_relation
    await gitCanvasRef.set(newGitCanvasEntry, { merge: true });

    return res.status(200).json({
      message: `GitHub integration successfully processed for project ${project_id}`,
      status: 200,
      data: {
        canvas_git_file_relation: newEntry,
        git_file_canvas_relation: newGitCanvasEntry
      }
    });

  } catch (error) {
    console.error("Error saving GitHub integration:", error.message);
    return res.status(500).json({
      error: "Internal server error",
      status: 500,
      details: error.message,
    });
  }
};

export default githubACFIntegration;
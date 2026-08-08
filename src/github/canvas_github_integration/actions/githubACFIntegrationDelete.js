import { db } from "../../../../config/firebase.js";
import { GetCurrentDateTime } from "../../../../utility/CommonUtils.js";

const githubACFIntegrationDelete = async (req, res) => {
  const { type, id } = req.body;

  if (!type || !id) {
    return res.status(400).json({
      status: 400,
      error: "Missing required fields: 'type' (document ID) and 'id' (project ID)",
    });
  }

  try {
    const docRef = db.collection("canvas_git_file_relation").doc(type);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      return res.status(404).json({
        status: 404,
        error: `Document with ID "${type}" not found`,
      });
    }

    const data = docSnapshot.data();
    const originalProjects = data.projects || [];

    // Log existing project IDs before filtering
    console.log("Existing project IDs:", originalProjects.map(p => p.id));
    console.log("Trying to remove ID:", id);

    // Filter out the project to be deleted
    const updatedProjects = originalProjects.filter(project => project.id !== id);

    // Check if the array was actually changed
    if (updatedProjects.length === originalProjects.length) {
      return res.status(404).json({
        status: 404,
        error: `No project with id "${id}" found in document "${type}"`,
      });
    }

    // Perform the update
    await docRef.set(
      {
        projects: updatedProjects,
        updated_at: GetCurrentDateTime(),
      },
      { merge: true }
    );

    return res.status(200).json({
      status: 200,
      message: `Project with id "${id}" removed successfully from document "${type}"`,
    });

  } catch (error) {
    console.error("Error removing project:", error);
    return res.status(500).json({
      status: 500,
      error: "Internal server error",
      message: error.message,
    });
  }
};

export default githubACFIntegrationDelete;

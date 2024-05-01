const FirebaseHandler = require("./firebase.js");

async function initFirebaseHandler(collectionName) {
    await FirebaseHandler.get(collectionName);
}

async function getAllCourses() {
    await initFirebaseHandler("allCourses");
    return FirebaseHandler.readAll();
}

async function calculateCourseHeights() {
    const allCourses = await getAllCourses();
    const graph = {};
    const heights = {};

    // Build the graph
    allCourses.forEach(course => {
        if (!graph[course.courseCode]) {
            graph[course.courseCode] = {
                prerequisites: course.preRequisities || [],
                followers: []
            };
        }
        (course.preRequisities || []).forEach(prereq => {
            if (!graph[prereq]) {
                graph[prereq] = { prerequisites: [], followers: [] };
            }
            graph[prereq].followers.push(course.courseCode);
        });
    });

    // Function to calculate heights using DFS
    function dfs(courseCode, visited, stack) {
        visited[courseCode] = true;
        let height = 1;
        graph[courseCode].followers.forEach(follower => {
            if (!visited[follower]) {
                height = Math.max(height, dfs(follower, visited, stack) + 1);
            } else if (stack[follower]) {
                console.error('Cycle detected in prerequisites for', courseCode);
            }
        });
        stack[courseCode] = false;
        heights[courseCode] = height;
        return height;
    }

    Object.keys(graph).forEach(courseCode => {
        if (!heights[courseCode]) {
            dfs(courseCode, {}, {});
        }
    });

    return heights;
}

async function writeCourseHeights() {
    try {
        const courseHeights = await calculateCourseHeights();
        await initFirebaseHandler("courseHeights");
        for (const [courseCode, height] of Object.entries(courseHeights)) {
            await FirebaseHandler.create({
                courseCode: courseCode,
                Height: height
            });
        }
        console.log("Course heights written to Firestore successfully!");
    } catch (error) {
        console.error("Failed to write course heights:", error);
    }
}

// Function to invoke the writing process
async function main() {
    await writeCourseHeights();
}

main();

//module.exports = { calculateCourseHeights };
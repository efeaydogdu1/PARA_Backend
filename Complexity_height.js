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
async function main() {
    try {
        const courseHeights = await calculateCourseHeights();
        console.log("Course Heights:", courseHeights);
        // Other logic using the course heights
    } catch (error) {
        console.error("Failed to calculate course heights:", error);
    }
}

//main();

module.exports = { calculateCourseHeights };
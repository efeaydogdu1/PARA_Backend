const { calculateCourseHeights } = require('./CourseDepthCalculator');

async function main() {
    try {
        const courseHeights = await calculateCourseHeights();
        console.log("Course Heights:", courseHeights);
        // Other logic using the course heights
    } catch (error) {
        console.error("Failed to calculate course heights:", error);
    }
}

main();

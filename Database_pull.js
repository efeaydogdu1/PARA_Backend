const FirebaseHandler = require("./firebase.js");
const pdfReader = require("./pdfreader.js");

// Initializes the FirebaseHandler with the collection name
async function initFirebaseHandler(collectionName) {
    await FirebaseHandler.get(collectionName);
}

// Retrieves degree requirements based on the first admit term
async function getDegreeRequirements(firstAdmitTerm) {
    const documentsData = await FirebaseHandler.readAll();
    return documentsData.find(doc => doc.firstAdmitTerm === firstAdmitTerm);
}

// Retrieves credits information for courses
async function getCreditsOfCourses() {
    const creditsData = await FirebaseHandler.readAll();
    return creditsData;
}
async function getAllCourses() {
    await initFirebaseHandler("allCourses");
    return FirebaseHandler.readAll();
}
async function getCourseHeights() {
    await initFirebaseHandler("courseHeights");
    const heightsData = await FirebaseHandler.readAll();
    const heightsMap = {};
    heightsData.forEach(doc => {
        heightsMap[doc.courseCode] = doc.Height;
    });
    return heightsMap;
}

async function getCourseCapacities() {
    await initFirebaseHandler("capacityStatus");
    const capacities = await FirebaseHandler.readAll();
    const capacityMap = {};
    capacities.forEach(doc => {
        capacityMap[doc.courseCode] = {
            capacity: doc.capacity,
            taken: doc.taken,
            fullness: doc.taken / doc.capacity
        };
    });
    return capacityMap;
}
// Counts how many courses of each type a student has taken based on their transcript and degree requirements
function countCoursesInCategories(transcript, degreeRequirement, creditsOfCoursesData) {
    let counts = {
        
        freeElectives: -5,
        coreElectives: -5,
        requiredCourses: 0,
        universityCourses: 0,
        areaElectives: -2,
        basicScienceECTS: -15,
        engineeringECTS: -70
    };

    function addCredits(courseCode) {
        const courseCredits = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
        if (courseCredits) {
            counts.basicScienceECTS += courseCredits.after2013basicScienceECTS || 0;
            counts.engineeringECTS += courseCredits.after2013engineeringECTS || 0;
        }
    }

    function categorizeCourse(course) {
        addCredits(course.code); // add credits to basicScienceECTS and engineeringECTS

        if (degreeRequirement.areaElectives.includes(course.code)) {
            counts.areaElectives++;
        } else if (degreeRequirement.freeElectives.includes(course.code)) {
            counts.freeElectives++;
        } else if (degreeRequirement.coreElectives.includes(course.code)) {
            counts.coreElectives++;
        } else if (degreeRequirement.requiredCourses.includes(course.code)) {
            counts.requiredCourses++;
        } else if (degreeRequirement.universityCourses.includes(course.code)) {
            counts.universityCourses++;
        }
    }

    // Count courses in academic history
    transcript.academic_history.forEach(term => term.courses.forEach(categorizeCourse));
    // Count courses in current courses
    transcript.current_courses.courses.forEach(categorizeCourse);

    return counts;
}

// Calculates the remaining credits based on the counts and degree requirements
function calculateRemainingCredits(counts, degreeRequirement) {
    return {
        areaElectives: Math.max(0, degreeRequirement.areaElectivesMinSU - counts.areaElectives * 3),
        freeElectives: Math.max(0, degreeRequirement.freeElectivesMinSU - counts.freeElectives * 3),
        coreElectives: Math.max(0, degreeRequirement.coreElectivesMinSU - counts.coreElectives * 3),
        requiredCourses: Math.max(0, degreeRequirement.requiredCoursesMinSU - counts.requiredCourses * 3),
        universityCourses: Math.max(0, degreeRequirement.universityCoursesMinSU - counts.universityCourses * 3),
        basicScienceECTS: Math.max(0, degreeRequirement.basicScienceMinECTS - counts.basicScienceECTS),
        engineeringECTS: Math.max(0, degreeRequirement.engineeringMinECTS - counts.engineeringECTS)
    };
}
async function recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript) {
    let takenCourseCodes = new Set(transcript.academic_history.flatMap(term => term.courses.map(course => course.code))
                                    .concat(transcript.current_courses.courses.map(course => course.code)));

    const courseHeights = await getCourseHeights(); // Fetch course heights for scoring
    const courseCapacities = await getCourseCapacities(); // Fetch current capacities and professor info for scoring
    let recommendationsByPool = {};

    const favoredProfessors = new Set(["Professor Name1", "Professor Name2"]); // Set of favored professors

    for (const pool of ['areaElectives', 'freeElectives', 'coreElectives', 'requiredCourses', 'universityCourses']) {
        if (remainingCredits[pool] > 0) {
            let potentialCourses = degreeRequirements[pool].filter(course => !takenCourseCodes.has(course));

            let poolRecommendedCourses = potentialCourses
                .filter(courseCode => {
                    const courseDetails = allCoursesData.find(course => course.courseCode === courseCode);
                    return courseDetails && courseDetails.preRequisities ? 
                           courseDetails.preRequisities.every(prerequisite => takenCourseCodes.has(prerequisite)) : 
                           true;
                })
                .filter(courseCode => {
                    const courseData = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
                    return courseData && (
                        (remainingCredits.basicScienceECTS > 0 && courseData.after2013basicScienceECTS > 0) ||
                        (remainingCredits.engineeringECTS > 0 && courseData.after2013engineeringECTS > 0)
                    );
                })
                .map(courseCode => {
                    const heightScore = courseHeights[courseCode] || 0;
                    const capacityData = courseCapacities[courseCode] || { capacity: 1, taken: 0, professor: "" };
                    const fullnessFactor = capacityData.taken / capacityData.capacity;
                    const isFavored = favoredProfessors.has(capacityData.professor);
                    const riskAdjustment = isFavored ? 0.2 * (1 - fullnessFactor) : 0.1 * (1 - fullnessFactor);
                    const score = heightScore + riskAdjustment; // Combine height with risk factor

                    return {
                        courseCode,
                        score: score,
                        section: capacityData.section,
                        professor: capacityData.professor // Including professor's name
                    };
                })
                .sort((a, b) => b.score - a.score) // Sort by score descending
                .map(item => `${item.courseCode} (Section: ${item.section}, Prof: ${item.professor})`); // Convert back to course codes for output

            recommendationsByPool[pool] = poolRecommendedCourses.slice(0, 10); // Limit to top recommendations per pool
        } else {
            recommendationsByPool[pool] = []; // No recommendations if pool credit requirement is met
        }
    }

    return recommendationsByPool;
}

async function courseCategoryAlgorithm(firstAdmitTerm, path) {
    try {
        await initFirebaseHandler("degreeRequirements");
        const degreeRequirements = await getDegreeRequirements(firstAdmitTerm);
        
        await initFirebaseHandler("creditsOfCourses");
        const creditsOfCoursesData = await getCreditsOfCourses();
        
        await initFirebaseHandler("allCourses");
        const allCoursesData = await getAllCourses();
        
        const transcript = await pdfReader.parseAndPrintTranscript(path);
        
        const counts = countCoursesInCategories(transcript, degreeRequirements, creditsOfCoursesData);
        const remainingCredits = calculateRemainingCredits(counts, degreeRequirements);
        
        const recommendations = await recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript);

        console.log("Category Counts:", counts);
        console.log("Remaining Credits:", remainingCredits);
        console.log("Recommendations by Pool:", recommendations);

        return { counts, remainingCredits, recommendations };
    } catch (error) {
        console.error("Error in course category algorithm:", error);
        throw error;
    }
}
function formatAdmitSemester(admitSemester) {
    // Regex to match the pattern "Fall 2019-2020"
    // It captures the season part and the year range part separately
    // This regex will ensure spaces around the hyphen are properly managed.
    const regex = /(\w+)\s(\d{4})-(\d{4})/;

    // Replace and reformat the string using the captured groups
    // The $2 and $3 refer to the captured year parts, and $1 refers to the semester part.
    // We're adding spaces around the hyphen for correct formatting.
    return admitSemester.replace(regex, '$2 - $3 / $1');
}
const path = 'C:\\Users\\Public\\PARA-backend\\Transcript.pdf';
// Execute the function with the specific term
async function run() {
    const transcript = await pdfReader.parseAndPrintTranscript(path);
    const formattedTerm = formatAdmitSemester(transcript.student_info.admit_semester);
        
    try {
        const result = await courseCategoryAlgorithm(formattedTerm, path);
        //console.log("Result:", result);
    } catch (error) {
        console.error("Failed to execute course category algorithm:", error);
    }
}

//run();
module.exports = {courseCategoryAlgorithm,formatAdmitSemester};


/*Category Counts: {      
  freeElectives: 0,     
  coreElectives: 9,     
  requiredCourses: 11,  
  universityCourses: 17,
  areaElectives: 1,     
  basicScienceECTS: 55, 
  engineeringECTS: 48   
}
Remaining Credits: {
  areaElectives: 6, 
  freeElectives: 15,
  coreElectives: 8,
  requiredCourses: 0,
  universityCourses: 0,
  basicScienceECTS: 5,
  engineeringECTS: 42
}
Recommendations by Pool: {
  areaElectives: [
    'ENS208 (Section: undefined, Prof: undefined)',
    'MATH301 (Section: undefined, Prof: undefined)',
    'CS48001 (Section: undefined, Prof: undefined)',
    'IE305 (Section: undefined, Prof: undefined)',
    'MATH311 (Section: undefined, Prof: undefined)',
    'MATH202 (Section: undefined, Prof: undefined)',
    'ENS222 (Section: undefined, Prof: )',
    'ME407 (Section: undefined, Prof: )',
    'MATH305 (Section: undefined, Prof: undefined)',
    'CS442 (Section: undefined, Prof: undefined)'
  ],
  freeElectives: [
    'ME307 (Section: undefined, Prof: undefined)',
    'PHYS303 (Section: undefined, Prof: undefined)',
    'NS201 (Section: undefined, Prof: undefined)',
    'ENS204 (Section: undefined, Prof: undefined)',
    'ENS201 (Section: undefined, Prof: undefined)',
    'ENS205 (Section: undefined, Prof: undefined)',
    'NS207 (Section: undefined, Prof: undefined)',
    'ENS202 (Section: undefined, Prof: undefined)',
    'IE407 (Section: undefined, Prof: )',
    'IE412 (Section: undefined, Prof: )'
  ],
  coreElectives: [
    'ENS211 (Section: undefined, Prof: undefined)',
    'CS305 (Section: undefined, Prof: undefined)',
    'CS302 (Section: undefined, Prof: undefined)',
    'CS403 (Section: undefined, Prof: undefined)',
    'CS400 (Section: undefined, Prof: undefined)',
    'EE308 (Section: undefined, Prof: undefined)',
    'CS411 (Section: undefined, Prof: undefined)',
    'CS406 (Section: undefined, Prof: undefined)',
    'CS445 (Section: undefined, Prof: undefined)',
    'CS437 (Section: undefined, Prof: undefined)'
  ],
  requiredCourses: [],
  universityCourses: []
}
*/ 


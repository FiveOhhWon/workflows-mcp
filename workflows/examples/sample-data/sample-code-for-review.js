// Sample JavaScript code with various issues for testing the code review workflow

class UserManager {
    constructor() {
        this.users = [];
        this.passwords = {}; // Security issue: storing passwords in memory
    }

    // Performance issue: O(n) lookup
    findUser(email) {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].email == email) { // Issue: using == instead of ===
                return this.users[i];
            }
        }
    }

    addUser(name, email, password) {
        // Issue: No input validation
        const user = {
            id: this.users.length + 1, // Issue: ID generation could cause conflicts
            name: name,
            email: email,
            created: new Date()
        };
        
        this.users.push(user);
        this.passwords[user.id] = password; // Security issue: storing plain text password
        
        console.log("User added: " + name); // Issue: should use template literals
    }

    // Issue: Synchronous file operation in async context
    saveToFile() {
        const fs = require('fs');
        fs.writeFileSync('users.json', JSON.stringify(this.users));
    }

    deleteUser(id) {
        // Bug: This doesn't actually remove the user from the array
        delete this.users[id];
        delete this.passwords[id];
    }

    // Memory leak: Event listeners not cleaned up
    startUserMonitoring() {
        setInterval(() => {
            console.log(`Active users: ${this.users.length}`);
        }, 1000);
    }

    // Issue: No error handling
    async fetchUserData(userId) {
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();
        return data;
    }

    // SQL injection vulnerability
    getUserByQuery(query) {
        const sql = `SELECT * FROM users WHERE name = '${query}'`;
        // database.execute(sql);
    }

    // Issue: Mutating array while iterating
    removeInactiveUsers(days) {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        this.users.forEach((user, index) => {
            if (user.lastActive < cutoff) {
                this.users.splice(index, 1);
            }
        });
    }
}

// Global variable pollution
var userManager = new UserManager();

// Issue: Callback hell
function processUserData(userId, callback) {
    getUserData(userId, function(err, user) {
        if (err) callback(err);
        validateUser(user, function(err, valid) {
            if (err) callback(err);
            if (valid) {
                updateUser(user, function(err, updated) {
                    if (err) callback(err);
                    callback(null, updated);
                });
            }
        });
    });
}

// Unused function (dead code)
function legacyUserProcessor() {
    // Old implementation
    return null;
}

// Issue: Magic numbers
function calculateUserScore(user) {
    return user.posts * 10 + user.comments * 5 + user.likes * 1;
}

// Export (but inconsistent style)
module.exports = UserManager;
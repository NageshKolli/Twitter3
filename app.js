const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// Authenticate user

const authenticateUser = async (req, res, next) => {
  const { authorization } = req.headers;
  let jwtToken;

  if (authorization !== undefined) {
    jwtToken = authorization.split(" ")[1];
  }

  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    try {
      const payload = jwt.verify(jwtToken, "MY_SECRET_KEY");
      req.username = payload.username;
      next();
    } catch (error) {
      res.status(401);
      res.send("Invalid JWT Token");
    }
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
        INSERT INTO 
          user (username, name, password, gender) 
        VALUES 
          (
            '${username}', 
            '${name}',
            '${hashedPassword}', 
            '${gender}'
          )`;
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

// API 2 - Login

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const getUserQuery = `
    SELECT 
      * 
    FROM 
      user 
    WHERE 
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  if (user === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

app.get("/tweets/:tweetId/", authenticateUser, async (req, res) => {
  const { tweetId } = req.params;
  const getTweetQuery = `
    SELECT 
      * 
    FROM 
      tweet
    WHERE 
      tweet_id = ${tweetId};`;
  const tweet = await db.get(getTweetQuery);
  res.send({
    userName: tweet.name,
    tweet: tweet.tweet,
    dateTime: tweet.date_time,
  });
});
// API 3

app.get("/user/tweets/feed/", authenticateUser, async (req, res) => {
  const { username } = req;
  const getFeedQuery = `
    SELECT 
      user.username,
      tweet.tweet,
      tweet.date_time
    FROM 
      user INNER JOIN follower
      ON user.user_id = follower.follower_user_id
      INNER JOIN tweet
      ON follower.following_user_id = tweet.user_id
    WHERE 
      follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')
    ORDER BY 
      tweet.date_time DESC
    LIMIT 
      4;`;
  const tweets = await db.all(getFeedQuery);
  res.send(tweets);
});

//API 4
app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getFollowingQuery = `
    SELECT 
      user.username
    FROM 
      user INNER JOIN follower
      ON user.user_id = follower.following_user_id
    WHERE 
      follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}');`;
  const following = await db.all(getFollowingQuery);
  response.send(following);
});
// API 5
app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getFollowersQuery = `
    SELECT 
      user.username
    FROM 
      user INNER JOIN follower
      ON user.user_id = follower.follower_user_id
    WHERE 
      follower.following_user_id = (SELECT user_id FROM user WHERE username = '${username}');`;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

// API 6
app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT 
      tweet.tweet,
      tweet.date_time,
      COUNT(like.like) AS likes,
      COUNT(reply.reply) AS replies
    FROM 
      tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE 
      tweet.tweet_id = ${tweetId};`;
  const tweetDetails = await db.get(getTweetQuery);
  response.send(tweetDetails);
});

// API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
      SELECT 
        user.username
      FROM 
        user INNER JOIN like
        ON user.user_id = like.user_id
      WHERE 
        like.tweet_id = ${tweetId};`;
    const likes = await db.all(getLikesQuery);
    response.send(likes);
  }
);

// API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { userId } = request.params;
    const getDistrictByIdQuery = `
    SELECT 
    name: tweet.name
    reply :reply.reply
    FROM user WHERE user_id = ${userId};`;
    const district = await db.get(getDistrictByIdQuery);
    response.send(convertDistrictDbObjectToResponseObject(district));
  }
);

// API 9
app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { userId } = request.params;
  const getDistrictByIdQuery = `
    SELECT 
    tweet: tweet.tweet,
    dateTime: tweet.date_time,
    like : like.like 
    replies :reply.reply
    FROM user WHERE user_id = ${userId};`;
  const district = await db.get(getDistrictByIdQuery);
  response.send(convertDistrictDbObjectToResponseObject(district));
});

// API 10
app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { tweet } = request.body;
  const createDistrictQuery = `
    INSERT INTO
      tweet (tweet)
    VALUES
      (
        '${tweet}'
      );`;
  await db.run(createDistrictQuery);
  response.send("Created a Tweet");
});

// API 11
app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const deleteDistrictQuery = `
    DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
  await db.run(deleteDistrictQuery);
  response.send("Tweet Removed");
});

module.exports = app;

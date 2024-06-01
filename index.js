const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 8000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}



// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.mq0mae1.mongodb.net/?retryWrites=true&w=majority&appName=Main`
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jimwvxl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const roomsCollection = client.db("stayvista").collection("rooms");
    const usersCollection = client.db("stayvista").collection("users");

    // verify admin middleware
    const verifyAdmin = async (req,res,next) =>{
      console.log("admin middleware");
      const user = req.user;
      const query = {email:user?.email};
      const result = await usersCollection.findOne(query);

      if (!result || result?.role !== 'admin') {
        return res.status(401).send({message:'unauthorized access.'})
      }

      next();

    }
    // verify admin middleware
    const verifyHost = async (req,res,next) =>{
      console.log("host middleware");
      const user = req.user;
      const query = {email:user?.email};
      const result = await usersCollection.findOne(query);

      if (!result || result?.role !== 'host') {
        return res.status(401).send({message:'unauthorized access.'})
      }

      next();

    }


    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // save a user data in database
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.status === "Requested") {
          // if existing user try to change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }
      }

      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      // welcome new user
      // sendEmail(user?.email, {
      //   subject: "Welcome to Stayvista!",
      //   message: `Hope you will find you destination`,
      // });
      res.send(result);
    });


    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });


    // get all users data from db
    app.get("/users",verifyToken,verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //update user role
    app.patch("/users/update/:email",async(req,res)=>{
      const email = req.params.email;
      const user = req.body;
      const query = {email};
      const updateDoc = {
        $set:{
          ...user,
          timestamp:Date.now()
        }
      }
      const result = await usersCollection.updateOne(query,updateDoc);
      res.send(result)
    })

    //get all rooms from db
    app.get("/rooms", async (req, res) => {
      const category = req.query.category;
      let query = {};
      if (category && category !== "null") query = { category };
      const result = await roomsCollection.find(query).toArray();
      res.send(result);
    });

    // save a room data to database
    app.post("/room", verifyToken, verifyHost, async (req, res) => {
      const result = await roomsCollection.insertOne(req.body);
      res.send(result);
    });

    //get all room for host
    app.get(
      "/my-listings/:email",
      verifyToken,
      verifyHost,
      async (req, res) => {
        const result = await roomsCollection
          .find({ "host.email": req.params.email })
          .toArray();
        res.send(result);
      }
    );

    //get a single room data from db using _id
    app.get("/room/:id", async (req, res) => {
      const result = await roomsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // delete a room
    app.delete("/room/:id", verifyToken, verifyHost, async (req, res) => {
      const result = await roomsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from StayVista Server..')
})

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`)
})

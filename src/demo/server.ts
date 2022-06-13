/* eslint-disable */
import express from 'express';
import { buildSchema } from 'graphql';
import expressRateLimiter from '../middleware/index.js';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const schema = buildSchema(`
                type Query {
        hero(episode: Episode): Character
        reviews(episode: Episode!, first: Int): [Review]
        search(text: String): [SearchResult]
        character(id: ID!): Character
        droid(id: ID!): Droid
        human(id: ID!): Human
        scalars: Scalars
    }    

    enum Episode {
        NEWHOPE
        EMPIRE
        JEDI
    }

    interface Character {
        id: ID!
        name: String!
        friends(first: Int): [Character]
        appearsIn: [Episode]!
    }

    type Human implements Character {
        id: ID!
        name: String!
        homePlanet: String
        friends(first: Int): [Character]
        appearsIn: [Episode]!
    }

    type Droid implements Character {
        id: ID!
        name: String!
        friends(first: Int): [Character]
        primaryFunction: String
        appearsIn: [Episode]!
    }

    type Review {
        episode: Episode
        stars: Int!
        commentary: String
    }

    union SearchResult = Human | Droid

    type Scalars {
        num: Int,
        id: ID,
        float: Float,
        bool: Boolean,
        string: String
        test: Test,
    }

    type Test {
        name: String,
        variable: Scalars
    }
            `);

const limiter = expressRateLimiter('TOKEN_BUCKET', { refillRate: 1, bucketSize: 10 }, schema, {});

app.post('/limit', limiter, (req, res) => {
    res.status(200).json(res.locals);
});

app.listen(3002, () => {
    console.log('server started on 3002');
});

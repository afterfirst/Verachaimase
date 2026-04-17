const express = require('express');
const router = express.Router();
const Favorite = require('../models/Favorite');
const authGuard = require('../middleware/authGuard');

// GET all favorites for the logged-in user
router.get('/favorites', authGuard, async (req, res) => {
    try {
        const favorites = await Favorite.find({ userId: req.user.id });
        res.json(favorites);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch favorites" });
    }
});

// SAVE a movie
router.post('/save', authGuard, async (req, res) => {
    try {
        const { movieId, title, posterPath } = req.body;
        const exists = await Favorite.findOne({ userId: req.user.id, movieId });
        if (exists) return res.status(400).json({ message: "Already in favorites" });

        const newFavorite = new Favorite({ userId: req.user.id, movieId, title, posterPath });
        await newFavorite.save();
        res.status(201).json({ message: "Saved! 🍿" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a favorite
router.delete('/favorite/:id', authGuard, async (req, res) => {
    try {
        // FIXED: Deletes specifically by the MongoDB ID provided in the front-end call
        await Favorite.findByIdAndDelete(req.params.id);
        res.json({ message: "Removed from favorites" });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed" });
    }
});

module.exports = router;
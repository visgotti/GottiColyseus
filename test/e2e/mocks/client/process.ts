import {DummySystem1, DummySystem2, DummySystem3, DummySystem4} from "./systems";

export const clientProcess= {
    isNetworked: true,
    type: 'test',
    systems: [DummySystem1],
    areas: [{
        type: 'area1',
        systems: [DummySystem2]
    }, {
        type: 'area2',
        systems: [DummySystem3]
    }, {
        type: 'area3',
        systems: [DummySystem2, DummySystem3, DummySystem4],
    }],
    globals: async (gameData, client) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                return resolve({
                    global: 'variable',
                    gameData,
                })
            }, 1)
        })
    },
};
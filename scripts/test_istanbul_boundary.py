"""Deterministic geometry tests: no network or third-party boundary required."""
import unittest
from review_istanbul_boundary import ring_contains,contains

class BoundaryGeometryTests(unittest.TestCase):
    def setUp(self):
        self.square=[[0,0],[10,0],[10,10],[0,10],[0,0]]
        self.hole=[[3,3],[7,3],[7,7],[3,7],[3,3]]
    def test_inside_and_outside(self):
        polygon={'type':'Polygon','coordinates':[self.square]}
        self.assertTrue(contains(2,2,polygon))
        self.assertFalse(contains(12,2,polygon))
    def test_hole_excluded(self):
        polygon={'type':'Polygon','coordinates':[self.square,self.hole]}
        self.assertTrue(contains(2,2,polygon))
        self.assertFalse(contains(5,5,polygon))
    def test_multipolygon(self):
        other=[[20,20],[30,20],[30,30],[20,30],[20,20]]
        geometry={'type':'MultiPolygon','coordinates':[[self.square],[other]]}
        self.assertTrue(contains(25,25,geometry))
        self.assertTrue(contains(5,5,geometry))
        self.assertFalse(contains(15,15,geometry))
    def test_reversed_ring_order(self):
        self.assertTrue(ring_contains(5,5,list(reversed(self.square))))
        self.assertFalse(ring_contains(15,5,list(reversed(self.square))))
if __name__=='__main__':unittest.main()

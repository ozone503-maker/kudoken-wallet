// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// Test stand-in for KDU on Ethereum Sepolia. Fixed 1B supply, 18 decimals, mirrors mainnet KDU shape.
contract KudokenTest {
    string public constant name = "Kudoken (test)";
    string public constant symbol = "KDU";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(address to) { totalSupply = 1_000_000_000e18; balanceOf[to] = totalSupply; emit Transfer(address(0), to, totalSupply); }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transfer(address t, uint256 v) external returns (bool) { _move(msg.sender, t, v); return true; }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) { require(a >= v, "allowance"); allowance[f][msg.sender] = a - v; }
        _move(f, t, v); return true;
    }
    function _move(address f, address t, uint256 v) internal { require(balanceOf[f] >= v, "balance"); balanceOf[f] -= v; balanceOf[t] += v; emit Transfer(f, t, v); }
}

pragma solidity ^0.4.24;

/*
    This is intended to represent a future ERC to standardize claim management.
    The interface is intended to match that of ERC780 as closely as possible,
    so that the two standards are interoperable. The difference with this
    standard is that claims are stored on a contract controlled by the issuer,
    rather than a global registry.
*/

contract ERCXXXX_ClaimIssuer {
    function getClaim(address subject, bytes32 key) public constant returns(bytes32);
}

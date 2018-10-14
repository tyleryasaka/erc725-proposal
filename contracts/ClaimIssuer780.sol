pragma solidity ^0.4.24;

import "./ERCXXXX_ClaimIssuer.sol";
import "./ERCXXXX_Identity.sol";
import "./ERC780.sol";

/*
    This is an example implementation of how claim management can be done in a
    way that is compliant with both ERCXXXX_ClaimIssuer and ERC780.
*/

contract ClaimIssuer780 is ERCXXXX_ClaimIssuer {
    ERC780 registry;
    ERCXXXX_Identity identity;

    constructor(address _registry, address _identity) public {
        registry = ERC780(_registry);
        identity = ERCXXXX_Identity(_identity);
    }

    function getClaim(address subject, bytes32 key) public view returns(bytes32) {
        return registry.getClaim(identity, subject, key);
    }
}